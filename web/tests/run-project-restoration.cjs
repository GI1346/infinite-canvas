const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");
process.chdir(path.resolve(__dirname, ".."));
require("./channel-protocol-dom.cjs");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = React;
const source = fs.readFileSync("src/pages/canvas/project.tsx", "utf8");
const ast = ts.createSourceFile("project.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "InfiniteCanvasPage");
const names = new Set("nodes connections chatSessions activeChatId viewport backgroundMode showImageInfo loadedProjectId projectLoaded".split(" "));
const declarations = [], effects = [];
for (const statement of page.body.statements) {
    const text = statement.getText(ast);
    if (ts.isVariableStatement(statement)) {
        const declaration = statement.declarationList.declarations[0];
        const name = ts.isIdentifier(declaration.name) ? declaration.name.text : declaration.name.elements?.[0]?.name?.text;
        if (names.delete(name)) declarations.push(text);
    } else if (text.startsWith("useEffect(") && (text.includes("if (!hydrated) return;") || text.includes("updateProject(projectId, { nodes,") || text.includes("viewportSaveTimerRef.current = setTimeout"))) effects.push(text);
}
assert.equal(names.size, 0);
assert.equal(effects.length, 3);
const js = ts.transpileModule(`function Harness({projectId}) {
${declarations.join("\n")}
const historyRef = useRef({past: [], future: []}), lastHistoryRef = useRef(null), historyCommitTimerRef = useRef(null), historyPausedRef = useRef(false), viewportSaveTimerRef = useRef(null), viewportRef = useRef(viewport);
useLayoutEffect(() => { viewportRef.current = viewport; });
${effects.join("\n")}
return React.createElement("div", null, projectId + ":" + nodes.map(n => n.id).join(",") + ":" + projectLoaded);
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
async function check({ loadedA, holdSessions = false, unmount = false }) {
    const pending = deferred(), writes = [];
    const projects = Object.fromEntries(["A", "B"].map((id) => [id, { id, nodes: [{id: id + "-node"}], connections: [], chatSessions: [{id}], activeChatId: id, backgroundMode: "lines", showImageInfo: false, viewport: {x: id === "A" ? 1 : 2, y: 0, k: 1} }]));
    const held = loadedA ? "B" : "A";
    const scope = { React, ...React, setHistoryState: () => {}, hydrated: true, openProject: (id) => projects[id], navigate: () => assert.fail("Unexpected navigation"), resetInterruptedGeneration: (nodes) => nodes,
        hydrateCanvasImages: (nodes) => !holdSessions && nodes[0].id === held + "-node" ? pending.promise.then(() => nodes) : Promise.resolve(nodes),
        hydrateAssistantImages: (sessions) => holdSessions && sessions[0].id === held ? pending.promise.then(() => sessions) : Promise.resolve(sessions),
        updateProject: (id, patch) => { writes.push({id, ...patch}); },
    };
    const Harness = new Function(...Object.keys(scope), `${js}; return Harness;`)(...Object.values(scope));
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => { root.render(React.createElement(Harness, {projectId: "A"})); await tick(); });
    if (loadedA) assert.equal(host.textContent, "A:A-node:true");
    await act(async () => { root.render(React.createElement(Harness, {projectId: "B"})); await tick(); });
    if (!loadedA) assert.equal(host.textContent, "B:B-node:true");
    assert.ok(writes.filter((write) => write.id === "B" && write.nodes).every((write) => write.nodes[0].id === "B-node"), "路由切换那轮 render 不能把 A 保存为 B");
    if (unmount) await act(async () => { root.unmount(); });
    await act(async () => { pending.resolve(); await tick(); });
    if (!unmount) {
        assert.equal(host.textContent, "B:B-node:true", "迟到的图片或会话恢复不得覆盖 B");
        await act(async () => { await tick(550); });
        assert.ok(writes.filter((write) => write.id === "B" && write.viewport).every((write) => write.viewport.x === 2));
        await act(async () => { root.unmount(); });
    }
    host.remove();
}
(async () => {
    await check({loadedA: false});
    await check({loadedA: true});
    await check({loadedA: false, holdSessions: true});
    await check({loadedA: false, unmount: true});
    console.log("PASS: 生产 load/save/viewport effects；迟到图片/会话恢复、切换已加载项目、卸载隔离；节点与视口未跨画布保存");
})().catch((error) => { console.error(error); process.exitCode = 1; });