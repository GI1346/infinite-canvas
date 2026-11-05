const path = require("node:path"), fs = require("node:fs"), ts = require("typescript");
const { buildSync } = require("esbuild");
const { execFileSync } = require("node:child_process");
process.chdir(path.resolve(__dirname, ".."));
fs.mkdirSync(".checks", { recursive: true });
const outfile = path.resolve(".checks/node-drag-performance.mjs");
// Exercise the actual page's reference and edge callbacks, rather than recreating them in a fixture.
const source = fs.readFileSync("src/pages/canvas/project.tsx", "utf8");
const ast = ts.createSourceFile("project.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === "InfiniteCanvasPage");
const names = new Set(["contentNodes", "contentNodeById", "nodeById", "connectionBoundsCache", "visibleConnections", "connectedNodesByNodeId", "referenceConnectedNodeIds", "selectNodeReference", "handleConnectionSelect", "handleConnectionContextMenu", "handleSidePanelPreview"]);
const statements = [];
for (const statement of page.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const name = statement.declarationList.declarations[0].name.getText(ast);
    if (names.delete(name)) statements.push(statement.getText(ast));
}
if (names.size) throw Error(`Missing production declarations: ${[...names]}`);
const fixture = `
import { nanoid } from "nanoid";
import { connectionCurve } from "../src/lib/canvas/canvas-connection-geometry";
import { getGroupResourceNodes, isCanvasReferenceNode } from "../src/lib/canvas/canvas-resource-references";
function useProjectDragReferences(nodes, connections, referencePickerNodeId, isNodeDragging = true) {
 const viewBounds = { left: -100, top: -100, right: 1000, bottom: 1000 };
 const dragRef = useRef({ movedIds: new Set() });
 const nodesRef = useRef(nodes); nodesRef.current = nodes;
 const setConnections = noop, setSelectedConnectionId = noop, setSelectedNodeIds = noop, setContextMenu = noop, setPreviewImageId = noop, setPreviewNodeId = noop;
 ${statements.join("\n")}
 return { visibleConnections, referenceConnectedNodeIds, selectNodeReference, handleConnectionSelect, handleConnectionContextMenu, handleSidePanelPreview };
}`;
const test = fs.readFileSync("tests/node-drag-performance.check.tsx", "utf8");
buildSync({ stdin: { contents: fixture + test, loader: "tsx", resolveDir: path.resolve("tests") }, bundle: true, platform: "node", format: "esm", packages: "external", outfile, define: { "import.meta.env.VITE_DEV_PLUGINS": '""' } });
try { execFileSync(process.execPath, ["--require", path.resolve("tests/llm-node-dom.cjs"), outfile], { stdio: "inherit" }); }
catch { process.exitCode = 1; }