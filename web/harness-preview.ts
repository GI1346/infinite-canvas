import { createServer, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Local development only: the same bundled Harness and canvas tools used by Electron. */
export function harnessPreview(projectRoot: string): Plugin {
    const require = createRequire(import.meta.url);
    const { startHarness } = require(resolve(projectRoot, "desktop/harness-host.cjs"));
    const token = randomBytes(24).toString("hex");
    const events = new Map<string, ServerResponse>();
    const pending = new Map<string, (value: unknown) => void>();
    let runtime: Awaited<ReturnType<typeof startHarness>>, runtimeProjectId = "", activeClient = "", opening: Promise<unknown> | undefined;
    let models: { projectId: string; selectedImageModel?: string } | null = null;
    const emit = (event: string, value: unknown) => {
        events.get(activeClient)?.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    };
    const bridgeToken = randomBytes(32).toString("hex");
    const bridge = createServer(async (req, res) => {
        if (req.method !== "POST" || req.url !== "/tool" || req.headers.authorization !== "Bearer " + bridgeToken || req.headers.origin) { res.writeHead(403); res.end(); return; }
        try {
            let body = "";
            for await (const chunk of req) body += chunk;
            const request = JSON.parse(body);
            if (!models?.projectId || models.projectId !== runtimeProjectId || !events.has(activeClient)) throw new Error("请先打开当前画布的 Harness");
            if (!request || typeof request.tool !== "string" || !request.args || typeof request.args !== "object" || Array.isArray(request.args)) throw new Error("无效的画布工具请求");
            const id = randomUUID();
            const result = new Promise((finish) => pending.set(id, finish));
            res.once("close", () => { if (pending.delete(id)) emit("cancel", id); });
            emit("tool", { id, projectId: models.projectId, imageModel: models.selectedImageModel || "", tool: request.tool, args: request.args });
            const value = await result;
            pending.delete(id);
            if (!res.destroyed) { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(value)); }
        } catch (error) { if (!res.destroyed) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); } }
    });
    return {
        name: "blinkflow-harness-preview",
        apply: "serve",
        transformIndexHtml: () => [{ tag: "meta", attrs: { name: "blinkflow-harness-preview", content: token }, injectTo: "head" }],
        configureServer(server) {
            server.middlewares.use("/__blinkflow_harness", async (req, res) => {
                const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
                if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "") || (req.headers["x-blinkflow-preview"] || requestUrl.searchParams.get("token")) !== token) { res.writeHead(403); res.end(); return; }
                const clientId = String(req.headers["x-blinkflow-client"] || requestUrl.searchParams.get("client") || "");
                if (!/^[0-9a-f-]{36}$/i.test(clientId)) { res.writeHead(403); res.end(); return; }
                if (req.method === "GET" && requestUrl.pathname === "/events") {
                    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
                    res.write("event: ready\ndata: true\n\n"); events.get(clientId)?.end(); events.set(clientId, res);
                    res.once("close", () => { if (events.get(clientId) === res) events.delete(clientId); }); return;
                }
                if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
                try {
                    let body = "";
                    for await (const chunk of req) body += chunk;
                    const value = JSON.parse(body || "null");
                    let result: unknown = null;
                    if (requestUrl.pathname === "/open") {
                        if (!value || typeof value.projectId !== "string" || !value.projectId || value.models?.projectId !== value.projectId) throw new Error("请先打开画布");
                        while (opening) await opening.catch(() => {});
                        const operation = (async () => {
                            const switchingClient = Boolean(activeClient && activeClient !== clientId);
                            if (switchingClient) {
                                for (const [id, finish] of pending) { emit("cancel", id); finish({ error: "Harness 已切换到另一个网页标签，旧标签工具已停止" }); }
                                pending.clear();
                            }
                            if (runtime && (switchingClient || runtimeProjectId !== value.projectId)) {
                                for (const [id, finish] of pending) { emit("cancel", id); finish({ error: "画布已切换，旧画布工具已停止" }); }
                                pending.clear(); await runtime.stop(); runtime = undefined;
                            }
                            activeClient = clientId;
                            models = value.models;
                            runtimeProjectId = value.projectId;
                            if (!runtime) {
                                if (!bridge.listening) await new Promise<void>((done, reject) => { bridge.once("error", reject); bridge.listen(0, "127.0.0.1", () => { bridge.removeListener("error", reject); done(); }); });
                                const address = bridge.address();
                                if (!address || typeof address === "string") throw new Error("画布工具连接未就绪");
                                runtime = await startHarness({ runtimeDirectory: resolve(projectRoot, "desktop/harness-runtime"), dataDirectory: resolve(projectRoot, ".preview/Harness"), bridgeUrl: "http://127.0.0.1:" + address.port, bridgeToken, openExternal: (url: string) => {
                                    const parsed = new URL(url);
                                    if (parsed.protocol !== "https:" || !(["deepseek.com", "github.com", "deepseek-harness.github.io"].includes(parsed.hostname) || parsed.hostname.endsWith(".deepseek.com"))) throw new Error("无效的官方登录地址");
                                    emit("external", parsed.href);
                                } });
                            }
                            return { url: runtime.url };
                        })();
                        opening = operation;
                        try { result = await operation; } finally { if (opening === operation) opening = undefined; }
                    } else if (requestUrl.pathname === "/models") { if (activeClient === clientId) models = value; }
                    else if (requestUrl.pathname === "/response") { if (activeClient === clientId) pending.get(value?.id)?.(value.result); }
                    else throw new Error("未知的 Harness 操作");
                    res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(result));
                } catch (error) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
            });
            server.httpServer?.once("close", () => {
                for (const finish of pending.values()) finish({ error: "网页预览已关闭" });
                pending.clear(); for (const client of events.values()) client.end(); events.clear();
                void runtime?.stop(); bridge.close();
            });
        },
    };
}
