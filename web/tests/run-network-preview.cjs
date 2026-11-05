const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "../.."), out = path.join(root, "web/.checks/network-preview");
fs.mkdirSync(out, { recursive: true });
for (const name of ["appData", "userData", "sessionData", "temp", "logs", "crashDumps"]) { const dir = path.join(out, name); fs.mkdirSync(dir, { recursive: true }); app.setPath(name, dir); }
process.env.TEMP = process.env.TMP = path.join(out, "temp");
app.disableHardwareAcceleration(); app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
let win, relay, preview, finished = false;
const finish = (result) => { if (finished) return; finished = true; fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2)); win?.destroy(); relay?.closeAllConnections(); relay?.close(); preview?.closeAllConnections(); preview?.close(); app.exit(result.ok ? 0 : 1); };
app.whenReady().then(async () => {
    require("../node_modules/esbuild").buildSync({ entryPoints: [path.join(root, "web/network-preview.ts")], bundle: true, platform: "node", format: "esm", packages: "external", outfile: path.join(out, "plugin.mjs") });
    const { networkPreview } = await import(pathToFileURL(path.join(out, "plugin.mjs")).href);
    const plugin = networkPreview(root), middleware = [];
    assert.equal(plugin.apply, "serve");
    plugin.configureServer({ middlewares: { use: (handler) => middleware.push(handler) } });
    const script = plugin.transformIndexHtml()[0].children;
    const requests = [];
    relay = http.createServer((req, res) => {
        if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET" }); return res.end(); }
        requests.push({ path: req.url, authorization: req.headers.authorization });
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": ["*", "*"] });
        res.end(JSON.stringify({ data: [{ id: "synthetic-model" }] }));
    });
    await new Promise(done => relay.listen(0, "127.0.0.1", done));
    const target = "http://127.0.0.1:" + relay.address().port;
    preview = http.createServer((req, res) => { let index = 0; const next = () => { if (middleware[index]) middleware[index++](req, res, next); else { res.writeHead(200, { "Content-Type": "text/html" }); res.end('<!doctype html><meta charset="utf-8"><script>' + script + '</script>'); } }; next(); });
    await new Promise(done => preview.listen(0, "127.0.0.1", done));
    const origin = "http://127.0.0.1:" + preview.address().port;
    win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    await win.loadURL(origin);
    const result = await win.webContents.executeJavaScript(`(async () => {
        let directRejected = false; try { await fetch(${JSON.stringify(target + "/v1/models")}, { headers: { Authorization: "Bearer synthetic-key" } }); } catch { directRejected = true; }
        const response = await fetch(window.blinkflowNetwork.proxyUrl + "/" + ${JSON.stringify(target + "/v1/models")}, { headers: { Authorization: "Bearer synthetic-key" } });
        const payload = await response.json();
        const invalidSession = await fetch(location.origin + "/__network/invalid/" + ${JSON.stringify(target + "/v1/models")});
        return { directRejected, status: response.status, model: payload.data[0].id, corsHeader: response.headers.get("access-control-allow-origin"), invalidSessionStatus: invalidSession.status };
    })()`);
    assert.equal(result.directRejected, true, "duplicate upstream ACAO rejects direct browser access");
    assert.equal(result.status, 200); assert.equal(result.model, "synthetic-model"); assert.equal(result.corsHeader, null); assert.equal(result.invalidSessionStatus, 403);
    assert.equal(requests.length, 2); assert.equal(requests[1].authorization, "Bearer synthetic-key");
    const capability = /__network\/([0-9a-f]+)/.exec(script)[1];
    const foreign = await fetch(origin + "/__network/" + capability + "/" + target + "/v1/models", { headers: { Origin: "https://untrusted.invalid" } });
    assert.equal(foreign.status, 403);
    finish({ ok: true, ...result, foreignOriginStatus: foreign.status, upstreamRequests: requests.length, credentialsPreserved: true, localPreviewOnly: true });
}).catch(error => finish({ ok: false, error: error.stack }));
setTimeout(() => finish({ ok: false, error: "Test watchdog expired" }), 60000).unref();
