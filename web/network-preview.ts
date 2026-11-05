import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Use the desktop transport during local web review, where upstream CORS headers may be invalid. */
export function networkPreview(projectRoot: string): Plugin {
    const { createNetworkProxy } = createRequire(import.meta.url)(resolve(projectRoot, "desktop/network.cjs"));
    const token = randomBytes(24).toString("hex");
    const networks = new Map<string, ReturnType<typeof createNetworkProxy>>();
    return {
        name: "blinkflow-network-preview",
        apply: "serve",
        transformIndexHtml: () => [{ tag: "script", children: `window.blinkflowNetwork ||= Object.freeze({proxyUrl:location.origin+"/__network/${token}"});`, injectTo: "head-prepend" }],
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (!req.url?.startsWith("/__network/")) return next();
                let origin: string;
                try {
                    const url = new URL(`http://${req.headers.host}`);
                    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "")) throw Error();
                    origin = url.origin;
                } catch { res.writeHead(403); res.end(); return; }
                let network = networks.get(origin);
                if (!network) {
                    network = createNetworkProxy({ origin, token, fetch: globalThis.fetch, version: "local-preview" });
                    networks.set(origin, network);
                }
                network.handle(req, res);
            });
        },
    };
}
