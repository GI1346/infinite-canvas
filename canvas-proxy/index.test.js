import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { createProxyServer } from "./index.js";

const listen = async (server) => { server.listen(0, "127.0.0.1"); await once(server, "listening"); return `http://127.0.0.1:${server.address().port}`; };
const close = async (server) => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
async function within(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Test event did not arrive")), 3000); })]); }
    finally { clearTimeout(timer); }
}

test("proxy forwards JSON/redirect POST, streams SSE, survives interruptions and propagates cancellation", async () => {
    const received = deferred(), disconnected = deferred(), release = deferred();
    const upstream = createServer(async (req, res) => {
        if (req.url === "/waiting") {
            res.on("close", () => disconnected.resolve());
            received.resolve();
            return;
        }
        if (req.url === "/broken") {
            res.writeHead(200, { "content-type": "text/event-stream" });
            res.write("data: first\n\n");
            setTimeout(() => res.destroy(), 30);
            return;
        }
        if (req.url === "/sse") {
            res.writeHead(200, { "content-type": "text/event-stream" });
            res.write("data: first\n\n");
            await release.promise;
            res.end("data: second\n\n");
            return;
        }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        if (req.url === "/redirect") { res.writeHead(307, { location: "/echo" }); res.end(); return; }
        res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "https://upstream.invalid" });
        res.end(JSON.stringify({ method: req.method, body: Buffer.concat(chunks).toString() }));
    });
    const proxy = createProxyServer();
    const base = await listen(upstream), proxyBase = await listen(proxy);
    try {
        const info = await (await fetch(proxyBase)).json();
        assert.equal(info.app, "infinite-canvas");
        assert.equal((await fetch(proxyBase, { method: "OPTIONS" })).status, 204);
        for (const path of ["/echo", "/redirect"]) {
            const response = await fetch(`${proxyBase}/${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"input":"保留请求"}' });
            assert.equal(response.headers.get("access-control-allow-origin"), "*");
            assert.deepEqual(await response.json(), { method: "POST", body: '{"input":"保留请求"}' });
        }
        const collapsed = base.replace("http://", "http:/");
        assert.equal((await fetch(`${proxyBase}/${collapsed}/echo`)).status, 200);
        const streaming = await fetch(`${proxyBase}/${base}/sse`), reader = streaming.body.getReader();
        assert.equal(new TextDecoder().decode((await within(reader.read())).value), "data: first\n\n");
        release.resolve();
        let tail = "";
        while (true) { const {value, done} = await reader.read(); if (done) break; tail += new TextDecoder().decode(value); }
        assert.equal(tail, "data: second\n\n");
        await assert.rejects(async () => { const response = await fetch(`${proxyBase}/${base}/broken`); await response.text(); });
        assert.equal((await fetch(`${proxyBase}/${base}/echo`)).status, 200, "SSE interruption must not crash the server");
        const client = request(`${proxyBase}/${base}/waiting`, { method: "POST" });
        client.on("error", () => {}); client.end("pending");
        await within(received.promise); client.destroy();
        await within(disconnected.promise);
        const partial = request(`${proxyBase}/${base}/echo`, { method: "POST", headers: { "content-length": "1000" } });
        partial.on("error", () => {}); partial.write("partial");
        await new Promise((resolve) => setTimeout(resolve, 30)); partial.destroy();
        assert.equal((await fetch(`${proxyBase}/${base}/echo`)).status, 200, "aborted upload must not crash or hang later requests");
    } finally { release.resolve(); await close(proxy); await close(upstream); }
});