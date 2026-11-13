// Executed only in the trusted local origin, without importing application stores.
const snapshotApi = async () => {
  const local = [];
  const key = 'infinite-canvas:ai_config_store';
  const raw = localStorage.getItem(key);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (!parsed.state?.config) throw new Error('API 配置格式异常，清理未执行');
    const fields = ['channelMode', 'baseUrl', 'apiKey', 'apiFormat', 'channels', 'models', 'model', 'imageModel', 'textModel', 'videoModel', 'audioModel', 'proxyEnabled', 'proxyUrl'];
    const config = Object.fromEntries(fields.filter((field) => Object.hasOwn(parsed.state.config, field)).map((field) => [field, parsed.state.config[field]]));
    local.push([key, JSON.stringify({ state: { config }, version: parsed.version ?? 0 })]);
  }
  for (const name of ['canvas-agent-url', 'canvas-agent-token', 'canvas-agent-model']) {
    const value = localStorage.getItem(name);
    if (value !== null) local.push([name, value]);
  }
  return { version: 1, local };
};

const restoreApi = async (api) => {
  for (const [key, value] of api.local) localStorage.setItem(key, value);
};
module.exports = { snapshotApi, restoreApi };
