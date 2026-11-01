const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), zlib = require('node:zlib'), Module = require('node:module');
const { app, net } = require('electron');
const root = path.resolve(__dirname, '../..'), web = path.join(root, 'web');
const output = path.resolve(process.argv[2] || path.join(root, '.checks/desktop-network')), mode = Number(process.argv[3] || 0);
if (!output.toLowerCase().startsWith(root.toLowerCase() + path.sep)) throw Error('Test output must stay inside workspace');
fs.mkdirSync(output, { recursive: true });
for (const [key, name] of [['appData','appdata'],['userData','profile'],['sessionData','profile'],['temp','temp'],['logs','logs'],['crashDumps','crashes']]) { const dir = path.join(output, name); fs.mkdirSync(dir, { recursive: true }); app.setPath(key, dir); }
process.env.TEMP = process.env.TMP = path.join(output, 'temp');
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
const log = (...items) => fs.appendFileSync(path.join(output, 'run.log'), items.join(' ') + '\n');
console.log = console.error = log; process.stdout.on('error', log); process.stderr.on('error', log);
let relay, win, completed = false, streamResponse, canceled = false, requests = [];
const finish = (code, result) => { if (completed) return; completed = true; fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); win?.destroy(); relay?.closeAllConnections(); relay?.close(); app.exit(code); };
(async () => {
 relay = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks), url = new URL(req.url, 'http://relay'); requests.push({ method: req.method, path: url.pathname });
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname.startsWith('/closed-task/')) return json({ error: { message:'Removed task domain must not be requested' } }, 500);
  if (url.pathname.startsWith('/closed-model/')) return req.socket.destroy();
  if (url.pathname.startsWith('/unauthorized/')) return json({ error: { message: 'synthetic invalid channel key' } }, 401);
  if (url.pathname === '/v1/images/generations' || url.pathname === '/v1/images/edits') return json({ data:[{ url:'https://generated.invalid/result.png' }] });
  if (url.pathname.endsWith('/models')) return json(url.pathname.startsWith('/v1beta') ? { models: [{ name: 'models/gemini-test' }] } : { data: [{ id: req.headers.authorization === 'Bearer test-text-key' ? 'test-text' : 'test-image' }] });
  if (url.pathname === '/sse') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: first\n\n'); streamResponse = res; return; }
  if (url.pathname === '/release-sse') { streamResponse?.end('data: second\n\n'); return json({ ok: true }); }
  if (url.pathname === '/cancel') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: waiting\n\n'); res.on('close', () => { canceled = true; }); return; }
  if (url.pathname === '/canceled') return json({ canceled });
  if (url.pathname === '/gzip') { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }); return res.end(zlib.gzipSync(JSON.stringify({ value: '压缩正常' }))); }
  if (url.pathname === '/binary') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(Buffer.from([0, 255, 128, 42])); }
  if (url.pathname === '/redirect') { res.writeHead(302, { Location: '/echo?redirected=1' }); return res.end(); }
  if (url.pathname.startsWith('/status/')) return json({ error: { message: 'test relay status', code: 'test-status' } }, Number(url.pathname.split('/').pop()));
  if (url.pathname === '/count') return json({ count: requests.filter(x => x.path === url.searchParams.get('path')).length });
  return json({ method: req.method, url: req.url, headers: req.headers, body: body.toString(), base64: body.toString('base64') }, req.method === 'PROPFIND' ? 207 : 200);
 });
 await new Promise(r => relay.listen(0, '127.0.0.1', r)); const mock = 'http://127.0.0.1:' + relay.address().port;
 const reserve = http.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
 await require(path.join(web, 'node_modules/esbuild')).build({ absWorkingDir: web, entryPoints: ['tests/desktop-network.check.tsx'], tsconfig: path.join(web, 'tsconfig.json'), bundle: true, platform: 'browser', format: 'iife', outfile: path.join(output, 'fixture/web/test.js'), nodePaths: [path.join(web, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}', '__APP_VERSION__': JSON.stringify(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()), '__APP_RELEASES__': '[]' } });
 const fixture = path.join(output, 'fixture');
 for (const name of fs.readdirSync(path.join(root, 'desktop')).filter(n => n.endsWith('.cjs'))) fs.copyFileSync(path.join(root, 'desktop', name), path.join(fixture, name));
 const css = fs.readdirSync(path.join(web, 'dist/assets')).find(n => n.endsWith('.css')); fs.copyFileSync(path.join(web, 'dist/assets', css), path.join(fixture, 'web/style.css'));
 fs.writeFileSync(path.join(fixture, 'web/index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script>window.testRelay=' + JSON.stringify(mock) + ';window.testMode=' + mode + '</script><script src="/test.js"></script>');
 app.on('browser-window-created', (_, window) => {
  win = window; window.show = window.maximize = () => {};
  const errors = []; window.webContents.on('console-message', (_, level, text) => { if (level === 3 && !/CORS|access control|Failed to load resource|net::ERR_FAILED/.test(text)) errors.push(text); });
  window.webContents.once('did-finish-load', async () => { try {
   const result = await window.webContents.executeJavaScript('window.check().catch(e => ({ error: e.stack, html: document.body.innerHTML.slice(-12000) }))');
   fs.writeFileSync(path.join(output, 'browser-result.json'), JSON.stringify(result,null,2));
   const { createNetworkProxy } = require('../network.cjs'); const errorCases = [];
   for (const code of ['ERR_NAME_NOT_RESOLVED', 'ERR_CERT_AUTHORITY_INVALID', 'ERR_PROXY_CONNECTION_FAILED', 'ERR_CONNECTION_CLOSED']) {
    const server = http.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port, proxy = createNetworkProxy({ origin, token: 'test-error', version: 'test', fetch: async () => { throw Error('net::' + code); } });
    server.on('request', (req, res) => proxy.handle(req, res));
    const response = await fetch(proxy.proxyUrl + '/https://example.invalid/v1/models'); const value = await response.json();
    if (response.status !== 502 || value.error.code !== code) throw Error('Error classification ' + code); errorCases.push(code); await new Promise(r => server.close(r));
   }
   fs.writeFileSync(path.join(output, 'appearance.png'), (await window.webContents.capturePage()).toPNG());
   finish(result.error || errors.length ? 1 : 0, { mode, result, errors, errorCases, requests, physicalComputerTest: false, productionMainAndPreload: true, nativeElectronNet: true });
  } catch (error) { finish(1, { error: error.stack }); } });
 });
 const main = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8').replaceAll('17456', String(port));
 const mod = new Module(path.join(fixture, 'main.cjs'), module); mod.filename = path.join(fixture, 'main.cjs'); mod.paths = Module._nodeModulePaths(fixture); mod._compile(main, mod.filename);
})().catch(error => finish(1, { error: error.stack }));
// Test watchdog only; production requests have no new timeouts or retries.
setTimeout(() => finish(1, { error: 'Test watchdog expired' }), 120000).unref();
