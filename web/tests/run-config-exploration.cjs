const path = require("node:path"), { buildSync } = require("esbuild"), { execFileSync } = require("node:child_process");
const web = path.resolve(__dirname, ".."), outfile = path.join(web, ".checks/config-exploration.cjs");
buildSync({ absWorkingDir: web, entryPoints: ["tests/config-exploration.check.tsx"], bundle: true, platform: "node", format: "cjs", packages: "external", outfile });
execFileSync(process.execPath, ["--require", path.join(web, "tests/channel-protocol-dom.cjs"), outfile], { stdio: "inherit", cwd: web });
