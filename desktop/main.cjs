const { app, BrowserWindow, dialog, shell, ipcMain, session, net, clipboard, nativeImage, nativeTheme } = require('electron');
const http = require('node:http');
const { pipeline } = require('node:stream/promises');
const { createNetworkProxy } = require('./network.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startHarness } = require('./harness-host.cjs');
const harnessReferences = require('./harness-references.cjs').createHarnessReferences();
const { prepareStorage, writeJson, resetFile } = require('./storage.cjs');
const { snapshotApi, restoreApi } = require('./storage-renderer.cjs');
const webUpdate = require('./web-update.cjs');
const legacy = path.join(app.getPath('appData'), 'Infinite Canvas DXOS');
// The chosen install directory, NOT the downloaded installer's location.
const installDirectory = app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
const dataDirectory = path.join(installDirectory, 'BlinkFlowData');
const origin = 'http://127.0.0.1:17456';
let restoredApi, storageReady = false;
try {
  const instance = path.join(dataDirectory, 'Instance');
  if (fs.existsSync(dataDirectory) && fs.lstatSync(dataDirectory).isSymbolicLink()) throw new Error('BlinkFlowData 必须是普通目录');
  fs.mkdirSync(instance, { recursive: true });
  fs.rmdirSync(fs.mkdtempSync(path.join(instance, '.write-test-')));
  app.setPath('userData', instance);
  storageReady = true;
} catch (error) {
  dialog.showErrorBox('数据目录不可写', `请将 BlinkFlow 安装在有写入权限的目录。不会改用其他存储位置。\n${error.message}`);
}
// 前端热更新的缓存目录：BlinkFlowData/webcache/web-x.y.z。数据目录不会被覆盖安装清掉，
// 所以热更新过的前端在重装之后仍然优先于安装包里自带的那份。
const webCache = path.join(dataDirectory, 'webcache');
let root = path.join(__dirname, 'web');
try {
  const cached = webUpdate.pickCachedWeb(webCache, app.getVersion());
  if (cached) root = cached.dir;
} catch { root = path.join(__dirname, 'web'); }
const mime = { '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function versionNumber(value) {
  const clean = String(value || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+$/.test(clean)) throw new Error('版本号不合法');
  return clean;
}

// 下载到本地文件并持续上报进度；GitHub Release 的附件会 302 到 S3，net.fetch 自动跟随。
async function downloadFile(url, target, onProgress, headers) {
  const response = await net.fetch(url, { redirect: 'follow', headers });
  if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}）`);
  const total = Number(response.headers.get('content-length') || 0);
  const file = fs.createWriteStream(target);
  let received = 0, sent = -1;
  try {
    await pipeline(response.body, async function* (source) {
      for await (const chunk of source) {
        received += chunk.byteLength;
        const percent = total ? Math.min(99, Math.floor((received / total) * 100)) : 0;
        if (percent !== sent) { sent = percent; onProgress?.({ percent, received, total }); }
        yield chunk;
      }
    }, file);
  } catch (error) {
    // pipeline 已等待文件流关闭；Windows 此时才能删除半成品。
    file.destroy();
    fs.rmSync(target, { force: true });
    throw error;
  }
  return { received, total };
}

// 部分网络会拦掉 github.com 的 CONNECT（502），但 api.github.com 与 objects.githubusercontent.com 可用，
// 所以先走常规下载地址，失败再通过 Release API 查附件 id 走 octet-stream 通道。
async function downloadAsset(clean, name, target, onProgress) {
  const candidates = [{ url: `https://github.com/GI1346/infinite-canvas/releases/download/v${clean}/${name}`, headers: undefined }];
  try {
    const meta = await net.fetch(`https://api.github.com/repos/GI1346/infinite-canvas/releases/tags/v${clean}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'blinkflow' } });
    if (meta.ok) {
      const asset = (await meta.json()).assets?.find((item) => item.name === name);
      if (asset?.url) candidates.push({ url: asset.url, headers: { Accept: 'application/octet-stream', 'User-Agent': 'blinkflow' } });
    }
  } catch { /* 拿不到附件列表就直接用常规地址的结果 */ }
  let lastError;
  for (const candidate of candidates) {
    try { return await downloadFile(candidate.url, target, onProgress, candidate.headers); }
    catch (error) { lastError = error; }
  }
  throw lastError;
}
let server, harness, harnessWindow, harnessOpening, harnessBridge, harnessProjectId, quitting = false, allowClose = false;
let harnessBridgePromise = null;
const harnessRequests = new Map();
let harnessModels = null;
// The bridge receives labels and IDs only; credentials stay in the main canvas renderer.
function cleanHarnessModels(state) {
  if (!state || typeof state.projectId !== 'string' || !state.projectId || typeof state.selectedImageModel !== 'string' || !Array.isArray(state.channels)) throw new Error('无效的画布模型目录');
  return { projectId: state.projectId, selectedImageModel: state.selectedImageModel, channels: state.channels.map(channel => {
    if (!channel || typeof channel.id !== 'string' || typeof channel.name !== 'string' || !Array.isArray(channel.models)) throw new Error('无效的生图中转站');
    return { id: channel.id, name: channel.name, models: channel.models.map(model => {
      if (!model || typeof model.id !== 'string' || typeof model.name !== 'string' || model.id !== channel.id + '::' + model.name) throw new Error('无效的生图模型');
      return { id: model.id, name: model.name };
    }) };
  }) };
}
if (!storageReady) app.exit(1);
else if (!app.requestSingleInstanceLock()) app.quit();
else {
  try {
    restoredApi = prepareStorage(dataDirectory, legacy);
    const profile = path.join(dataDirectory, 'Profile');
    app.setPath('userData', profile);
    app.setPath('sessionData', profile);
    app.setPath('temp', path.join(dataDirectory, 'Temp'));
    process.env.TEMP = process.env.TMP = path.join(dataDirectory, 'Temp');
    app.setAppLogsPath(path.join(dataDirectory, 'Logs'));
    app.setPath('crashDumps', path.join(dataDirectory, 'CrashDumps'));
    app.setPath('downloads', path.join(dataDirectory, 'Downloads'));
    app.commandLine.appendSwitch('disk-cache-dir', path.join(profile, 'Cache'));
  } catch (error) {
    storageReady = false;
    dialog.showErrorBox('存储初始化失败', String(error.message || error));
    app.exit(1);
  }
  app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    if (!storageReady) return;
    const network = createNetworkProxy({ origin, token: crypto.randomBytes(24).toString('hex'), fetch: (url, options) => net.fetch(url, options), version: app.getVersion() });
    // Stable loopback origin preserves IndexedDB/localforage across restarts and upgrades.
    server = http.createServer((req, res) => {
      if (network.handle(req, res)) return;
      try {
        const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
        if (name === '/__storage') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<!doctype html><meta charset="utf-8"><title>BlinkFlow</title><p>正在整理本地存储…</p>'); }
        const target = path.resolve(root, '.' + name);
        if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
        const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(root, 'index.html');
        res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // index.html 绝不缓存：热更新替换的是同 origin 下的文件，旧 HTML 会引到已被换掉的 hash 资源。
        if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).on('error', () => { res.statusCode = 500; res.end(); }).pipe(res);
      } catch { res.writeHead(400); res.end(); }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(17456, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    }).catch((error) => {
      if (error.code === 'EADDRINUSE') throw new Error('本机端口 17456 已被占用。请关闭占用该端口的程序后重试，以便继续读取原有画布和配置。', { cause: error });
      throw error;
    });
    const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 650, show: false, title: 'BlinkFlow', icon: path.join(__dirname, 'assets', 'blinkflow.ico'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    let clearing = false;
    const trusted = (event) => {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('无效的存储操作来源');
    };
    ipcMain.on('network:info', (event) => {
      try { trusted(event); event.returnValue = { proxyUrl: network.proxyUrl }; }
      catch { event.returnValue = null; }
    });

    // Close is confirmed inside the app so the dialog follows the app theme; the renderer only
    // gets to say "yes" or nothing at all. A second X while the dialog is open is ignored.
    win.on('close', (event) => {
      if (allowClose || quitting) return;
      event.preventDefault();
      if (win.webContents.isDestroyed()) { allowClose = true; win.destroy(); return; }
      win.webContents.send('app:close-request');
    });
    ipcMain.on('app:confirm-close', (event) => {
      try { trusted(event); } catch { return; }
      allowClose = true;
      app.quit();
    });

    // Clipboard runs in the main process: the renderer's async clipboard API needs window
    // focus and a fresh user gesture, which is why copying failed whenever a menu, a dialog
    // or another window had taken focus. Writing through Electron has neither constraint.
    const clipboardText = (value) => typeof value === 'string' ? value.slice(0, 4 * 1024 * 1024) : '';
    ipcMain.handle('clipboard:write', (event, payload) => {
      trusted(event);
      const text = clipboardText(payload?.text);
      const png = payload?.png;
      if (png !== undefined && !(png instanceof ArrayBuffer)) throw new Error('无效的剪贴板图片数据');
      const image = png ? nativeImage.createFromBuffer(Buffer.from(png)) : null;
      if (image && image.isEmpty()) throw new Error('无效的剪贴板图片数据');
      if (!image && !text) { clipboard.clear(); return true; }
      clipboard.write({ ...(text ? { text } : {}), ...(image ? { image } : {}) });
      return true;
    });
    ipcMain.handle('clipboard:read', (event) => {
      trusted(event);
      const image = clipboard.readImage();
      return { text: clipboard.readText(), png: image.isEmpty() ? null : image.toPNG() };
    });
    // Ctrl+V 时要先同步判断这份剪贴板能不能由画布自己粘：preventDefault 只能同步调用，
    // 异步读完再决定就已经晚了。所以这里只回文本和"有没有图片"，不搬大图字节。
    ipcMain.on('clipboard:peek', (event) => {
      try { trusted(event); event.returnValue = { text: clipboard.readText(), hasImage: !clipboard.readImage().isEmpty() }; }
      catch { event.returnValue = null; }
    });

    // Native menus (including the <select> popup on Windows) are drawn by the platform and
    // ignore the page's CSS. Syncing themeSource keeps them dark when the app theme is dark.
    ipcMain.handle('theme:set', (event, theme) => {
      trusted(event);
      nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light';
      return nativeTheme.shouldUseDarkColors;
    });
    let harnessSelection = null;
    const currentHarnessModels = () => harnessModels?.projectId === harnessProjectId ? harnessModels : null;
    const publishHarnessModels = () => { if (harnessWindow && !harnessWindow.isDestroyed()) harnessWindow.webContents.send('harness:models-changed', currentHarnessModels()); };
    const trustedHarness = (event) => {
      if (!harness || !harnessWindow || harnessWindow.isDestroyed() || event.sender !== harnessWindow.webContents || event.senderFrame !== harnessWindow.webContents.mainFrame || new URL(event.senderFrame.url).origin !== new URL(harness.url).origin) throw new Error('无效的 Harness 模型操作来源');
    };
    ipcMain.on('harness:models', (event, state) => {
      try { trusted(event); harnessModels = state === null ? null : cleanHarnessModels(state); publishHarnessModels(); }
      catch { /* Reject an invalid or unrelated renderer without exposing configuration. */ }
    });
    ipcMain.on('harness:selection', (event, state) => {
      try {
        trusted(event);
        if (state !== null && (!state || typeof state.projectId !== 'string' || !Array.isArray(state.nodes) || state.nodes.some(node => !node || typeof node.id !== 'string' || typeof node.title !== 'string' || typeof node.type !== 'string'))) return;
        harnessSelection = state === null ? null : { projectId: state.projectId, nodes: state.nodes.map(({ id, title, type }) => ({ id, title, type })) };
        if (harnessWindow && !harnessWindow.isDestroyed()) harnessWindow.webContents.send('harness:selection-changed');
      } catch { /* Ignore unrelated renderers. */ }
    });
    ipcMain.handle('harness:selection-get', (event) => { trustedHarness(event); return currentHarnessModels() && harnessSelection?.projectId === harnessProjectId ? harnessSelection : null; });
    ipcMain.handle('harness:reference-resolve', (event, nodeId, projectId) => {
      trustedHarness(event);
      if (!currentHarnessModels() || projectId !== harnessProjectId || typeof nodeId !== 'string') throw new Error('画布已切换，请重新框选节点');
      const id = crypto.randomUUID();
      return new Promise((resolve) => {
        harnessRequests.set(id, { finish: (value) => { harnessRequests.delete(id); resolve(value); } });
        win.webContents.send('harness:tool', { id, projectId: harnessProjectId, tool: 'resolve_reference', args: { nodeId } });
      });
    });
    ipcMain.handle('harness:models-get', (event) => { trustedHarness(event); return currentHarnessModels(); });
    ipcMain.handle('harness:model-select', (event, imageModel) => {
      trustedHarness(event);
      const state = currentHarnessModels();
      if (!state) throw new Error('画布已切换，请从当前画布重新打开 Harness');
      if (typeof imageModel !== 'string' || (imageModel && !state.channels.some(channel => channel.models.some(model => model.id === imageModel)))) throw new Error('生图模型已移除，请重新选择');
      harnessModels = { ...state, selectedImageModel: imageModel };
      win.webContents.send('harness:image-model', { projectId: state.projectId, imageModel });
      publishHarnessModels();
    });
    const cancelHarnessRequests = (message) => {
      for (const [id, pending] of harnessRequests) {
        if (!win.isDestroyed()) win.webContents.send('harness:cancel', id);
        pending.finish({ error: message });
      }
    };
    const startHarnessBridge = async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const bridge = http.createServer((req, res) => {
        if (req.method !== 'POST' || req.url !== '/tool' || req.headers.authorization !== 'Bearer ' + token || req.headers.origin) { res.writeHead(403); return res.end(); }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => { body += chunk; });
        req.on('error', () => { if (!res.writableEnded) res.destroy(); });
        req.on('end', () => {
          let request;
          try {
            request = JSON.parse(body);
            if (!request || typeof request.tool !== 'string' || !request.args || typeof request.args !== 'object' || Array.isArray(request.args)) throw new Error('无效的画布工具请求');
            if (win.isDestroyed() || new URL(win.webContents.getURL()).origin !== origin) throw new Error('请先打开 BlinkFlow 画布');
          } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: error.message })); }
          const id = crypto.randomUUID();
          const finish = (value) => {
            harnessRequests.delete(id);
            if (!res.destroyed && !res.writableEnded) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); }
          };
          harnessRequests.set(id, { finish });
          res.once('close', () => { if (harnessRequests.delete(id) && !win.isDestroyed()) win.webContents.send('harness:cancel', id); });
          win.webContents.send('harness:tool', { id, projectId: harnessProjectId, imageModel: currentHarnessModels()?.selectedImageModel || '', tool: request.tool, args: request.args });
        });
      });
      await new Promise((resolve, reject) => { bridge.once('error', reject); bridge.listen(0, '127.0.0.1', resolve); });
      harnessBridge = { server: bridge, token, url: 'http://127.0.0.1:' + bridge.address().port };
      return harnessBridge;
    };
    const ensureHarnessBridge = () => harnessBridge || (harnessBridgePromise ??= startHarnessBridge().finally(() => { harnessBridgePromise = null; }));
    const openHarnessExternal = async (url) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !(parsed.hostname === 'deepseek.com' || parsed.hostname.endsWith('.deepseek.com') || parsed.hostname === 'github.com' || parsed.hostname === 'deepseek-harness.github.io')) throw new Error('未打开非官方 Harness 外部地址');
      await shell.openExternal(parsed.href);
    };
    ipcMain.handle('harness:open', async (event, options) => {
      trusted(event);
      if (!options || typeof options.projectId !== 'string' || !options.projectId) throw new Error('请先打开画布');
      const models = cleanHarnessModels(options.models);
      if (models.projectId !== options.projectId) throw new Error('画布模型目录与当前画布不匹配');
      while (harnessOpening) {
        await harnessOpening.catch(() => {});
        trusted(event);
        if (harnessModels?.projectId !== options.projectId) throw new Error('画布已切换，请从当前画布重新打开 Harness');
      }
      harnessModels = models;
      harnessOpening = (async () => {
        if (harness && harnessProjectId !== options.projectId) {
          cancelHarnessRequests('画布已切换，旧画布工具已停止');
          if (harnessWindow && !harnessWindow.isDestroyed()) harnessWindow.destroy();
          await harness.stop(); harness = null;
        }
        harnessProjectId = options.projectId;
        if (!harness) {
          const bridge = await ensureHarnessBridge();
          harness = await startHarness({ runtimeDirectory: app.isPackaged ? path.join(process.resourcesPath, 'harness-runtime') : path.join(__dirname, 'harness-runtime'), dataDirectory: path.join(dataDirectory, 'Harness'), bridgeUrl: bridge.url, bridgeToken: bridge.token, openExternal: openHarnessExternal });
        }
        publishHarnessModels();
        return { url: harness.url };
      })();
      try { return await harnessOpening; }
      finally { harnessOpening = null; }
    });
    ipcMain.handle('harness:references-add', (event, options) => {
      trusted(event);
      if (!options || options.projectId !== harnessProjectId || harnessModels?.projectId !== options.projectId || !harnessWindow || harnessWindow.isDestroyed()) throw new Error('画布已切换，请重新添加到 Harness');
      const id = harnessReferences.add(options.projectId, options.files);
      harnessWindow.webContents.send('harness:references-changed');
      return id;
    });
    ipcMain.handle('harness:references-get', (event) => { trustedHarness(event); return currentHarnessModels() ? harnessReferences.get(harnessProjectId) : []; });
    ipcMain.handle('harness:references-ack', (event, id) => { trustedHarness(event); if (currentHarnessModels() && typeof id === 'string') harnessReferences.ack(harnessProjectId, id); });
    ipcMain.on('harness:response', (event, id, result) => {
      try { trusted(event); } catch { return; }
      if (typeof id !== 'string' || !result || typeof result !== 'object') return;
      harnessRequests.get(id)?.finish(result);
    });
    win.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => { if (isMainFrame) cancelHarnessRequests('画布页面已切换，工具请求已停止'); });
    win.on('closed', () => { cancelHarnessRequests('画布已关闭'); app.quit(); });
    const exportName = (name) => {
      if (typeof name !== 'string') throw new Error('无效的导出名称');
      const clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[ .]+$/, '');
      if (!clean || clean === '.' || clean === '..') throw new Error('无效的导出名称');
      return /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean) ? '_' + clean : clean;
    };
    ipcMain.handle('fs:export-directory-bundle', async (event, folders) => {
      trusted(event);
      if (!Array.isArray(folders) || !folders.length) throw new Error('没有可导出的画布');
      const manifest = folders.map((folder) => {
        if (!folder || !Array.isArray(folder.files)) throw new Error('无效的导出清单');
        return { name: exportName(folder.folderName), files: folder.files.map((file) => {
          if (!file || (typeof file.textContent === 'string') === (typeof file.dataBase64 === 'string') || (typeof file.dataBase64 === 'string' && (file.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataBase64)))) throw new Error('无效的导出内容');
          return { name: exportName(file.filename), text: file.textContent, base64: file.dataBase64 };
        }) };
      });
      const selected = await dialog.showOpenDialog(win, { title: '选择导出目录', properties: ['openDirectory', 'createDirectory'] });
      if (selected.canceled || !selected.filePaths[0]) return { canceled: true };
      const directory = await fs.promises.realpath(selected.filePaths[0]);
      let writtenFiles = 0;
      for (const folder of manifest) {
        // Reserve a new child folder. Never follow or reuse an existing symlink/junction.
        let target;
        for (let index = 0; ; index++) {
          target = path.join(directory, index ? folder.name + '_' + index : folder.name);
          try { await fs.promises.mkdir(target); break; } catch (error) { if (error.code !== 'EEXIST') throw error; }
        }
        for (const file of folder.files) {
          const parsed = path.parse(file.name);
          for (let index = 0; ; index++) {
            const dest = path.join(target, index ? parsed.name + '_' + index + parsed.ext : file.name);
            try { await fs.promises.writeFile(dest, typeof file.text === 'string' ? file.text : Buffer.from(file.base64, 'base64'), { flag: 'wx' }); writtenFiles++; break; }
            catch (error) { if (error.code !== 'EEXIST') throw error; }
          }
        }
      }
      return { canceled: false, directory, writtenFiles };
    });
    ipcMain.handle('fs:save-json-file', async (event, suggestedName, jsonString) => {
      trusted(event);
      if (typeof jsonString !== 'string') throw new Error('无效的工作流内容');
      const name = exportName(suggestedName);
      const picked = await dialog.showSaveDialog(win, { title: '保存工作流 JSON', defaultPath: /\.json$/i.test(name) ? name : name + '.json', filters: [{ name: 'BlinkFlow Workflow JSON', extensions: ['json'] }] });
      if (picked.canceled || !picked.filePath) return { canceled: true };
      await fs.promises.writeFile(picked.filePath, jsonString, 'utf8');
      return { canceled: false, filePath: picked.filePath };
    });

    ipcMain.handle('downloads:images', async (event, files) => {
      trusted(event);
      if (!Array.isArray(files) || files.some((file) => !file || typeof file.name !== 'string' || path.basename(file.name) !== file.name || /[<>:"/\\|?*\x00-\x1f]/.test(file.name) || !(file.data instanceof ArrayBuffer))) throw new Error('无效的图片下载数据');
      if (!files.length) return { canceled: true, count: 0 };
      const selected = await dialog.showOpenDialog(win, { title: '选择批量图片保存目录', defaultPath: path.join(dataDirectory, 'Downloads'), properties: ['openDirectory', 'createDirectory'] });
      if (selected.canceled || !selected.filePaths[0]) return { canceled: true, count: 0 };
      const directory = selected.filePaths[0]; let count = 0;
      for (const file of files) {
        const parsed = path.parse(file.name); let index = 1, destination = path.join(directory, file.name);
        while (true) {
          try { await fs.promises.writeFile(destination, Buffer.from(file.data), { flag: 'wx' }); break; }
          catch (error) { if (error.code !== 'EEXIST') throw error; destination = path.join(directory, parsed.name + ' (' + index++ + ')' + parsed.ext); }
        }
        count++;
      }
      return { canceled: false, count, directory };
    });
    // 前端热更新：只下载 dist 压缩包（约 30MB），解压到 BlinkFlowData/webcache 后直接切根目录重载窗口。
    // 不装安装器、不动 BlinkFlowData 里的画布数据，几秒就能用上新版本。
    ipcMain.handle('update:hot', async (event, version) => {
      trusted(event);
      const clean = versionNumber(version);
      const name = `BlinkFlow-Web-${clean}.zip`;
      const target = path.join(app.getPath('temp'), name);
      const report = (progress) => { if (!event.sender.isDestroyed()) event.sender.send('update:progress', progress); };
      await downloadAsset(clean, name, target, report);
      const size = fs.statSync(target).size;
      if (size < 1024 * 1024) throw new Error('热更新包下载不完整，请重试');
      report({ percent: 100, received: size, total: size });
      const directory = path.join(webCache, `web-${clean}`);
      fs.rmSync(directory, { recursive: true, force: true });
      fs.mkdirSync(directory, { recursive: true });
      const files = webUpdate.extractZip(fs.readFileSync(target), directory);
      if (!fs.existsSync(path.join(directory, 'index.html'))) throw new Error('热更新包内容不完整，请改用完整安装包');
      for (const entry of fs.readdirSync(webCache)) if (entry !== `web-${clean}`) fs.rmSync(path.join(webCache, entry), { recursive: true, force: true });
      root = directory;
      // 换的是同一 origin 下的文件，必须绕过缓存重载，否则可能拿旧的 index.html 去引已被替换的 hash 资源。
      setTimeout(() => { if (!win.isDestroyed()) win.webContents.reloadIgnoringCache(); }, 600);
      return { version: clean, files };
    });

    // 兜底：热更新不可用时下载完整安装包并拉起安装向导。
    ipcMain.handle('update:install', async (event, version) => {
      trusted(event);
      const clean = versionNumber(version);
      const name = `BlinkFlow-Setup-${clean}-x64.exe`;
      const target = path.join(app.getPath('temp'), name);
      const report = (progress) => { if (!event.sender.isDestroyed()) event.sender.send('update:progress', progress); };
      await downloadAsset(clean, name, target, report);
      const size = fs.statSync(target).size;
      if (size < 50 * 1024 * 1024) throw new Error('安装包下载不完整，请重试');
      report({ percent: 100, received: size, total: size });
      const openError = await shell.openPath(target);
      if (openError) throw new Error(openError);
      // 安装器会覆盖安装并保留 BlinkFlowData，这里直接放行关闭，不再弹应用内的关闭确认。
      allowClose = true;
      setTimeout(() => app.quit(), 1200);
      return { path: target };
    });
    ipcMain.handle('storage:info', (event) => { trusted(event); return { installDirectory, dataDirectory }; });
    ipcMain.handle('storage:open', async (event) => { trusted(event); const error = await shell.openPath(dataDirectory); if (error) throw new Error(error); });
    ipcMain.handle('storage:clear', async (event) => {
      trusted(event);
      if (clearing) throw new Error('清理已在进行');
      const result = await dialog.showMessageBox(win, { type: 'warning', buttons: ['取消', '清除并重启'], defaultId: 0, cancelId: 0, title: '清除本地数据', message: '保留 API 配置，清除其余本地数据？', detail: '将删除全部画布、素材、输入和输出图片、历史、日志、缓存、临时文件以及 BlinkFlowData/Downloads 内的下载文件，不创建备份。保留渠道、各自的 Key、模型绑定、自定义协议和 Agent 连接凭据。外部原文件不会删除。' });
      if (result.response !== 1) return false;
      clearing = true;
      try {
        // Unload all stores/tasks before taking the authoritative API snapshot.
        await win.loadURL(origin + '/__storage');
        const api = await win.webContents.executeJavaScript(`(${snapshotApi.toString()})()`);
        session.defaultSession.flushStorageData();
        writeJson(path.join(dataDirectory, resetFile), api);
        app.relaunch();
        app.quit();
        return true;
      } catch (error) { clearing = false; await win.loadURL(origin + '/config'); throw error; }
    });
    const downloads = new Set();
    session.defaultSession.on('will-download', (_event, item) => {
      const filename = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'download';
      const parsed = path.parse(filename);
      let destination = path.join(dataDirectory, 'Downloads', filename), index = 1;
      while (fs.existsSync(destination) || downloads.has(destination)) destination = path.join(dataDirectory, 'Downloads', `${parsed.name} (${index++})${parsed.ext}`);
      downloads.add(destination);
      item.once('done', () => downloads.delete(destination));
      item.setSavePath(destination);
    });
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) { event.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
    if (restoredApi) {
      await win.loadURL(origin + '/__storage');
      await win.webContents.executeJavaScript(`(${restoreApi.toString()})(${JSON.stringify(restoredApi)})`);
      session.defaultSession.flushStorageData();
      fs.unlinkSync(path.join(dataDirectory, resetFile));
      restoredApi = null;
    }
    await win.loadURL(origin);
    win.setMenuBarVisibility(false);
    // Every launch starts maximized, independent of the previous window size.
    win.maximize();
    win.show();
  }).catch((error) => { dialog.showErrorBox('启动失败', String(error.message || error)); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  // 关机 / 注销时不再拦着问，系统会话结束就让它结束。
  app.on('query-session-end', () => { allowClose = true; });
  app.on('before-quit', () => { quitting = true; harness?.stop(); harnessBridge?.server.close(); server?.close(); });
}
