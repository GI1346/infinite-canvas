#!/usr/bin/env node
import { createServer } from "node:http";
import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

const require = createRequire(import.meta.url);
const { Agent, buildConnector } = require("undici");
const pkg = require("./package.json");
const metadata = new BlockList();
metadata.addAddress("169.254.169.254");

function isMetadataAddress(address) {
    const family = isIP(address);
    return family !== 0 && metadata.check(address, family === 6 ? "ipv6" : "ipv4");
}

function blockedTarget() {
    return Object.assign(new Error("代理禁止访问云元数据地址"), { code: "BLOCKED_TARGET" });
}

function targetDispatcher() {
    const connect = buildConnector({
        timeout: 0,
        lookup(hostname, options, callback) {
            lookup(hostname, { ...options, all: true }, (error, addresses) => {
                if (error) return callback(error);
                if (addresses.some(({ address }) => isMetadataAddress(address))) return callback(blockedTarget());
                // The socket uses these checked results directly, including on redirects.
                if (options.all) callback(null, addresses);
                else callback(null, addresses[0].address, addresses[0].family);
            });
        },
    });
    return new Agent({ headersTimeout: 0, bodyTimeout: 0, connect(options, callback) {
        // IP literals bypass DNS lookup.
        const hostname = options.hostname.replace(/^\[|\]$/g, "");
        if (isMetadataAddress(hostname)) return callback(blockedTarget());
        connect(options, callback);
    } });
}

const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "*",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "*",
    "access-control-max-age": "86400",
};

/** Headers that describe the hop to this proxy rather than the upstream request. */
const SKIP_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "accept-encoding", "origin", "referer", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site"]);
/** fetch() already decoded and re-framed the body, so the upstream framing headers no longer apply. */
const SKIP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

function readArg(args, name, fallback) {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    // Blob keeps the body replayable when fetch follows a 307/308 redirect.
    return new Blob(chunks);
}

function readTarget(url) {
    const raw = url.slice(1);
    // decodeURI undoes the escaping browsers apply to the path while keeping intentional encodeURIComponent escapes.
    let target = raw;
    try {
        target = decodeURI(raw);
    } catch {
        // Malformed escape sequence: forward the raw form instead of failing.
    }
    // Some clients collapse the "//" in the embedded target URL, so restore it before parsing.
    target = target.replace(/^(https?:)\/*/i, "$1//");
    return /^https?:\/\/[^/]/i.test(target) ? target : "";
}

function requestHeaders(req) {
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (SKIP_REQUEST_HEADERS.has(key) || value === undefined) continue;
        headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
    return headers;
}

function responseHeaders(upstream) {
    const headers = { ...CORS_HEADERS };
    upstream.headers.forEach((value, key) => {
        if (SKIP_RESPONSE_HEADERS.has(key) || key.startsWith("access-control-")) return;
        headers[key] = value;
    });
    return headers;
}

function sendJson(res, status, payload) {
    res.writeHead(status, { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
}

function logForward(method, target, outcome, startedAt) {
    console.log(`${new Date().toLocaleTimeString()} ${method} ${target} -> ${outcome} ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

async function forward(req, res, target, dispatcher, onResponse) {
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", onClose);
    try {
        const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
        const upstream = await fetch(target, { method: req.method, headers: requestHeaders(req), body, redirect: "follow", signal: controller.signal, dispatcher });
        res.writeHead(upstream.status, responseHeaders(upstream));
        if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
        else res.end();
        onResponse(upstream.status);
    } finally {
        res.removeListener("close", onClose);
    }
}

export function createProxyServer() {
    const dispatcher = targetDispatcher();
    const server = createServer((req, res) => {
        if (req.method === "OPTIONS") {
            res.writeHead(204, CORS_HEADERS);
            res.end();
            return;
        }
        const target = readTarget(req.url || "/");
        if (!target) {
            sendJson(res, 200, { app: "infinite-canvas", proxy: pkg.name, version: pkg.version, usage: "/<full-target-url>" });
            return;
        }
        const startedAt = Date.now();
        const method = req.method || "GET";
        forward(req, res, target, dispatcher, (status) => logForward(method, target, status, startedAt))
            .catch((error) => {
                const blocked = error.cause?.code === "BLOCKED_TARGET";
                const reason = blocked ? error.cause.message : error instanceof Error ? error.message : String(error);
                logForward(method, target, `failed (${reason})`, startedAt);
                if (res.destroyed) return;
                if (res.headersSent) {
                    res.destroy();
                    return;
                }
                sendJson(res, blocked ? 403 : 502, { error: reason });
            });
    });
    server.once("close", () => { void dispatcher.destroy(); });
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    const args = process.argv.slice(2);
    if (args.includes("--help") || args.includes("-h")) {
        console.log(`${pkg.name} v${pkg.version}\n\nUsage: npx ${pkg.name}@latest [--port 23210] [--host 127.0.0.1]\n\nForwards http://<host>:<port>/<full-target-url> to <full-target-url> with permissive CORS headers.`);
        process.exit(0);
    }

    const port = Number(readArg(args, "port", process.env.PORT || 23210));
    const host = readArg(args, "host", process.env.HOST || "127.0.0.1");

    createProxyServer().listen(port, host, () => {
        console.log(`${pkg.name} v${pkg.version} listening on http://${host}:${port}`);
        console.log(`Fill this address into Infinite Canvas → 配置 → 本地代理: http://${host}:${port}`);
    });
}
