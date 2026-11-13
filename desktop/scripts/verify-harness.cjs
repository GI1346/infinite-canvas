const fs = require('node:fs');
const path = require('node:path');

/**
 * 打包前检查官方 Harness 运行时是否齐备。
 *
 * harness-runtime/node 与 runtime/node_modules 是 .gitignore 的构建产物，
 * 全新克隆的仓库里没有它们。缺少时 electron-builder 仍会成功产出一个
 * 小一圈的安装包，但 Harness 会在启动时报"缺少运行组件"。
 */
const root = path.join(__dirname, '..', 'harness-runtime');
const required = [
    ['node', process.platform === 'win32' ? 'node.exe' : 'node'],
    ['runtime', 'boot.mjs'],
    ['runtime', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'],
];
const missing = required
    .map((parts) => path.join(root, ...parts))
    .filter((file) => !fs.existsSync(file));

if (missing.length) {
    console.error('缺少 DeepSeek Harness 运行时，打包会产出无法打开 Harness 的安装包。');
    for (const file of missing) console.error('  缺失：' + path.relative(path.join(__dirname, '..'), file));
    console.error('请先执行：node desktop/scripts/prepare-harness.cjs');
    process.exit(1);
}

console.log('Harness 运行时检查通过：' + required.length + ' 个组件齐备');
