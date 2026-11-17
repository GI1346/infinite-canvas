const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// 只实现热更新需要的子集：本地文件头 + 中央目录，支持 store / deflate 两种压缩方式。
// 不引入第三方依赖，避免为了一个解压把桌面端依赖树撑大。
function readZipEntries(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('压缩包损坏：找不到目录区');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('压缩包损坏：目录项无效');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractZip(buffer, destination) {
  const entries = readZipEntries(buffer);
  let files = 0;
  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, '/');
    if (!name || name.endsWith('/')) continue;
    const target = path.resolve(destination, name);
    if (target !== destination && !target.startsWith(destination + path.sep)) throw new Error(`压缩包路径越界：${entry.name}`);
    if (buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error('压缩包损坏：文件头无效');
    const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(start, start + entry.compressedSize);
    const data = entry.method === 0 ? raw : entry.method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error(`不支持的压缩方式：${entry.method}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    files++;
  }
  return files;
}

function versionParts(version) {
  const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

/** a 比 b 新返回正数，相同返回 0，更旧返回负数。 */
function compareVersions(a, b) {
  const left = versionParts(a) || [0, 0, 0];
  const right = versionParts(b) || [0, 0, 0];
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

/** 在缓存目录里找比当前安装版本更新的前端包；没有就返回 null，由调用方回退到内置 web。 */
function pickCachedWeb(cacheRoot, installVersion) {
  let best = null;
  let names = [];
  try { names = fs.readdirSync(cacheRoot); } catch { return null; }
  for (const name of names) {
    const match = /^web-(\d+\.\d+\.\d+)$/.exec(name);
    if (!match) continue;
    if (compareVersions(match[1], installVersion) <= 0) continue;
    if (!fs.existsSync(path.join(cacheRoot, name, 'index.html'))) continue;
    if (!best || compareVersions(match[1], best.version) > 0) best = { version: match[1], dir: path.join(cacheRoot, name) };
  }
  return best;
}

module.exports = { extractZip, compareVersions, pickCachedWeb };
