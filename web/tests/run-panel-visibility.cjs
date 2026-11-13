const { buildSync } = require("esbuild");
const { execFileSync } = require("node:child_process");

const outfile = ".checks/panel-visibility.mjs";
buildSync({
    entryPoints: ["tests/panel-visibility.check.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile,
    loader: { ".tsx": "tsx" },
    jsx: "automatic",
});
execFileSync(process.execPath, ["--require", "./tests/channel-protocol-dom.cjs", outfile], { stdio: "inherit" });
