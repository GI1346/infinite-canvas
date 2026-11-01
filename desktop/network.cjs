const { Readable } = require('node:stream');

// Same-origin, per-launch capability. Never log URLs, bodies or credentials.
function createNetworkProxy({ origin, token, fetch: nativeFetch, version }) {
  const prefix = '/__network/' + token + '/';
  const proxyUrl = origin + prefix.slice(0, -1);
  const hop = new Set(['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length']);
  const fail = (res, status, message, code) => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) return res.destroy();
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: { message, code, type: 'desktop_network_error' } }));
  };
  async function forward(req, res) {
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) return fail(res, 403, '无效的桌面请求来源', 'INVALID_ORIGIN');
    const raw = req.url.slice(prefix.length);
    if (!raw) {
      if (req.method !== 'GET') return fail(res, 405, '服务检查仅支持 GET', 'INVALID_METHOD');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ proxy: 'BlinkFlow 内置网络转发', version }));
    }
    let target;
    try {
      target = new URL(raw);
      if (!/^https?:$/.test(target.protocol) || target.username || target.password || target.origin === origin) throw Error();
    } catch { return fail(res, 400, '中转地址必须是有效的 HTTP 或 HTTPS 地址', 'INVALID_URL'); }
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', cancel);
    req.once('aborted', cancel);
    try {
      const headers = {};
      const excluded = new Set([...hop, ...(String(req.headers.connection || '').toLowerCase().split(',').map(v => v.trim()))]);
      for (const [key, value] of Object.entries(req.headers)) {
        if (!excluded.has(key) && !['origin', 'referer', 'cookie', 'accept-encoding'].includes(key) && !key.startsWith('sec-') && value !== undefined) headers[key] = value;
      }
      let body;
      if (!['GET', 'HEAD'].includes(req.method)) { const chunks = []; for await (const chunk of req) chunks.push(chunk); body = Buffer.concat(chunks); }
      const response = await nativeFetch(target.href, { method: req.method, headers, body, signal: controller.signal, redirect: 'follow', credentials: 'omit', cache: 'no-store' });
      if (res.destroyed) { await response.body?.cancel(); return; }
      const output = {};
      for (const [key, value] of response.headers) {
        if (!hop.has(key) && !['content-encoding', 'set-cookie'].includes(key) && !key.startsWith('access-control-')) output[key] = value;
      }
      // Keep HTTP errors and SSE chunks intact; never retry a possibly paid request.
      res.writeHead(response.status, output);
      if (!response.body || req.method === 'HEAD') return res.end();
      const stream = Readable.fromWeb(response.body);
      res.once('close', () => stream.destroy());
      stream.once('error', () => { if (!res.destroyed) res.destroy(); });
      stream.pipe(res);
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = /(?:net::)?(ERR_[A-Z_]+)/.exec(String(error?.message))?.[1] || error?.cause?.code || 'CONNECTION_FAILED';
      const detail = /NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/.test(code) ? '域名解析失败' : /CERT|SSL|TLS/.test(code) ? '证书或 TLS 连接失败' : /PROXY|TUNNEL/.test(code) ? '系统代理连接失败' : '连接失败';
      fail(res, 502, '桌面网络转发：' + detail + '（' + code + '）。请检查中转地址、系统代理和网络。', code);
    }
  }
  return { proxyUrl, handle(req, res) {
    if (!req.url.startsWith('/__network/')) return false;
    if (!req.url.startsWith(prefix)) fail(res, 403, '桌面网络会话已失效，请重新打开页面', 'INVALID_SESSION');
    else void forward(req, res);
    return true;
  } };
}
module.exports = { createNetworkProxy };
