import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { act, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CanvasNode } from "../src/components/canvas/canvas-node";
import { InfiniteCanvas } from "../src/components/canvas/infinite-canvas";
import { dxosNodeDefinitions } from "../src/components/canvas/nodes/dxos-workflow-nodes";
import { llmNodeDefinition } from "../src/components/canvas/nodes/dxos-llm-node";
import { registerNodeDefinitions } from "../src/lib/canvas/node-registry";
import { TABLE_TYPE, CONCURRENT_TYPE, emptyTable, readTable, tableRows, deleteTableRow } from "../src/lib/canvas/dxos-table";
import { useAssetStore } from "../src/stores/use-asset-store";
import { emitCanvasEvent } from "../src/lib/canvas/canvas-event-bus";
import { LLM_TYPE } from "../src/lib/canvas/dxos-llm";
import { tableConnectionPort } from "../src/lib/canvas/canvas-table-port";
import { connectionCurve } from "../src/lib/canvas/canvas-connection-geometry";
import { ActiveConnectionPath } from "../src/components/canvas/canvas-connections";
import { applyCanvasAgentOps, type CanvasAgentSnapshot } from "../src/lib/canvas/canvas-agent-ops";
import type { CanvasNodeData, ConnectionHandle, ViewportTransform } from "../src/types/canvas";
import type { CanvasPluginHost } from "../src/types/canvas-plugin";

registerNodeDefinitions([llmNodeDefinition, ...dxosNodeDefinitions, { type: "image", title: "图片", icon: null, defaultSize: { width: 300, height: 240 } }]);
const no = () => {}, tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
async function test(name: string, work: () => unknown | Promise<unknown>) { await work(); console.log(`PASS ${name}`); passed++; }
async function fire(target: EventTarget, event: Event) { await act(async () => { target.dispatchEvent(event); await tick(event.type === "wheel" ? 25 : 5); }); return event; }
const mouse = (type: string, options = {}) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, ...options });
const pointer = (type: string, options = {}) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1, ...options });
async function down(target: EventTarget, options = {}) { await fire(target, pointer("pointerdown", options)); await fire(target, mouse("mousedown", options)); }
const base = { scale: 1, isSelected: false, isRelated: false, isFocusRelated: false, isConnectionTarget: false, isConnecting: false, showPanel: false, showImageInfo: false, onHoverStart: no, onHoverEnd: no, onResizeStart: no, onResize: no, onResizeEnd: no, onContentChange: no, onTitleChange: no, onContextMenu: no };
const makeNode = (id: string, type: string, metadata = {}): CanvasNodeData => ({ id, type, title: id, position: { x: 400, y: 200 }, width: 430, height: 600, metadata });

async function main() {
    const table = makeNode("table", TABLE_TYPE, { table: { ...emptyTable(), rows: [["翻译", "参考"]] }, tableInputChannels: [1, 2, 3, 4, 5].map((i) => ({ id: `input-${i}` })) });
    const batch = makeNode("batch", CONCURRENT_TYPE), llm = makeNode("llm", LLM_TYPE), image = makeNode("image", "image");
    let state: CanvasAgentSnapshot = { projectId: "offline", title: "offline", nodes: [table, batch, llm, image], connections: [{ id: "table-batch", fromNodeId: table.id, toNodeId: batch.id }], selectedNodeIds: [], viewport: { x: 70, y: -35, k: 1 } };
    let render = no, viewport = state.viewport, drags: string[] = [], starts: ConnectionHandle[] = [], requests = 0;
    const network = globalThis.fetch;
    globalThis.fetch = async () => { requests++; throw new Error("Offline acceptance must not send API requests"); };
    const host: CanvasPluginHost = {
        getNode: (id) => state.nodes.find((node) => node.id === id) || null, getNodes: () => state.nodes, getConnections: () => state.connections, getUpstream: () => [], getDownstream: () => [],
        updateMetadata: (id, metadata) => { state = applyCanvasAgentOps(state, [{ type: "update_node", id, metadata }]); render(); }, updateNode: no, applyOps: (ops) => { state = applyCanvasAgentOps(state, ops); render(); }, openPanel: no, closePanel: no,
        ai: { listModels: () => [], defaultModel: () => "", generateImage: async () => { requests++; return { images: [] }; }, generateVideo: async () => { requests++; return { url: "" }; }, generateText: async () => { requests++; return { text: "" }; } },
    };
    const ref = createRef<HTMLDivElement>();
    function Harness() { const [, update] = useState(0), [v, setV] = useState(viewport); render = () => update((n) => n + 1); return <InfiniteCanvas containerRef={ref} viewport={v} tool="select" onViewportChange={(next) => { viewport = next; setV(next); }}>{state.nodes.filter((node) => node.id !== image.id).map((node) => <CanvasNode key={node.id} {...base} data={node} pluginHost={host} onContentChange={(id, value) => host.updateMetadata(id, { content: value })} onMouseDown={(_, id) => drags.push(id)} onConnectStart={(event, nodeId, handleType, portId) => { event.stopPropagation(); starts.push({ nodeId, handleType, portId }); }} />)}</InfiniteCanvas>; }
    const el = document.createElement("div"); document.body.append(el); const root = createRoot(el);
    await act(async () => { root.render(<Harness />); await tick(); });
    const box = { left: 265, top: 92, width: 1000, height: 800 };
    ref.current!.getBoundingClientRect = () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: no });
    const nodeEl = (id: string) => el.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
    const content = (id: string) => { const chat = nodeEl(id).querySelector<HTMLElement>("[data-llm-chat]"); if (chat) return chat; let current = nodeEl(id).querySelector<HTMLElement>("[data-node-drag-handle]")!; while (!current.classList.contains("text-2xl")) current = current.parentElement!; return current; };
    try {
        await test("LLM/表格/并发根留白和标题旁间隙真实DOM鼠标按下可拖动，不再仅限标题", async () => {
            for (const node of [table, batch, llm]) {
                const body = content(node.id), heading = body.querySelector<HTMLElement>("[data-node-drag-handle]") || nodeEl(node.id).querySelector<HTMLElement>("[data-node-title] button")!;
                for (const target of [body, heading.parentElement!, heading]) { const before = drags.length; await down(target); await fire(window, mouse("mouseup")); assert.equal(drags.length, before + 1, node.id); assert.equal(drags.at(-1), node.id); }
            }
        });
        await test("输入/按钮/选择器/单元格/字段/摘要和结果文本交互不冒泡为节点拖动", async () => {
            const controls = [table, batch, llm].flatMap((node) => [...content(node.id).querySelectorAll("input,textarea,select,button,table td,table th,label,[data-node-no-drag]")]);
            const before = drags.length;
            for (const control of controls) { await down(control); await fire(window, mouse("mouseup")); }
            assert.equal(drags.length, before); assert.equal(requests, 0);
        });
        await test("可滚动区域不拖动，非溢出空白允许拖动且滚轮缩放不移动节点", async () => {
            for (const node of [table, batch]) {
                const scroll = nodeEl(node.id).querySelector<HTMLElement>("[data-node-scroll]")!;
                Object.defineProperties(scroll, { clientHeight: { configurable: true, value: 100 }, scrollHeight: { configurable: true, value: 300 }, clientWidth: { configurable: true, value: 100 }, scrollWidth: { configurable: true, value: 100 } });
                const before = drags.length; await down(scroll); assert.equal(drags.length, before);
                Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 100 }); await down(scroll); assert.equal(drags.length, before + 1);
                const old = viewport.k; await fire(scroll, new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -50, clientX: 550, clientY: 450 })); assert.ok(viewport.k > old); assert.deepEqual(node.position, { x: 400, y: 200 });
            }
        });
        await test("三个节点全部控件上Space+左键优先平移，节点和控件不被激活", async () => {
            const controls = [content(table.id), content(batch.id), content(llm.id), ...el.querySelectorAll("input,textarea,select,button,[data-node-handle]")];
            const before = drags.length, connects = starts.length;
            for (const control of controls) {
                const old = { ...viewport }; await fire(window, new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Space", key: " " })); await down(control, { clientX: 500, clientY: 300 }); await fire(window, pointer("pointermove", { clientX: 530, clientY: 320 })); await act(async () => { await tick(25); }); await fire(window, pointer("pointerup", { clientX: 530, clientY: 320 })); await fire(control, mouse("click")); await fire(window, new KeyboardEvent("keyup", { bubbles: true, cancelable: true, code: "Space", key: " " }));
                assert.equal(viewport.x, old.x + 30); assert.equal(viewport.y, old.y + 20); assert.equal(drags.length, before); assert.equal(starts.length, connects); assert.equal(requests, 0);
            }
        });
        await test("只有聚焦编辑时空格和滚轮让路，点击画布空白立即退出编辑并恢复导航", async () => {
            const editor = content(llm.id).querySelector<HTMLTextAreaElement>("textarea")!;
            await act(async () => { editor.focus(); await tick(); });
            assert.equal(document.activeElement, editor);
            const initial = { ...viewport };
            const space = await fire(editor, new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Space", key: " " }));
            assert.equal(space.defaultPrevented, false, "focused editor receives typed spaces");
            const editingWheel = await fire(editor, new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -50, clientX: 550, clientY: 450 }));
            assert.equal(editingWheel.defaultPrevented, false, "focused editor keeps native text scroll");
            assert.deepEqual(viewport, initial);
            await fire(editor, new KeyboardEvent("keyup", { bubbles: true, cancelable: true, code: "Space", key: " " }));
            await down(ref.current!, { clientX: 300, clientY: 100 });
            assert.notEqual(document.activeElement, editor, "background pointerdown must blur despite preventDefault");
            await fire(window, pointer("pointerup"));
            const beforeZoom = viewport.k;
            const hoverWheel = await fire(editor, new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -50, clientX: 550, clientY: 450 }));
            assert.equal(hoverWheel.defaultPrevented, true);
            assert.ok(viewport.k > beforeZoom, "hovering an unfocused input zooms the canvas");
            const beforePan = { ...viewport };
            await fire(document.body, new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Space", key: " " }));
            const panDown = await fire(editor, pointer("pointerdown", { clientX: 500, clientY: 300 }));
            assert.equal(panDown.defaultPrevented, true, "space drag cannot focus the input");
            await fire(editor, mouse("mousedown", { clientX: 500, clientY: 300 }));
            await fire(window, pointer("pointermove", { clientX: 530, clientY: 320 }));
            await fire(window, pointer("pointerup"));
            await fire(editor, mouse("click"));
            await fire(document.body, new KeyboardEvent("keyup", { bubbles: true, cancelable: true, code: "Space", key: " " }));
            assert.notEqual(document.activeElement, editor);
            assert.equal(viewport.x, beforePan.x + 30);
            assert.equal(viewport.y, beforePan.y + 20);
        });
        await test("表格五个输入端口从嵌套span发起连接时各自传递准确portId且不拖动", async () => {
            const before = drags.length;
            for (let i = 1; i <= 5; i++) {
                const port = nodeEl(table.id).querySelector<HTMLElement>(`[data-table-port="input-${i}"]`)!; assert.ok(port.hasAttribute("data-node-handle")); await down(port.querySelector("span")!); assert.deepEqual(starts.at(-1), { nodeId: table.id, handleType: "target", portId: `input-${i}` });
            }
            assert.equal(drags.length, before);
        });
        await test("真实DOM mouseup坐标在偏移/平移/五档缩放下落到输入2/3/N并持久保存端口", async () => {
            const priorElementFromPoint = document.elementFromPoint;
            try {
                for (const k of [.05, .25, 1, 2, 5]) for (let i = 1; i <= 5; i++) {
                    const v = { x: -133, y: 87, k }, world = { x: table.position.x, y: table.position.y + table.height / 2 + (i - 3) * 56 }, screen = { clientX: box.left + v.x + world.x * k, clientY: box.top + v.y + world.y * k };
                    const port = nodeEl(table.id).querySelector<HTMLElement>(`[data-table-port="input-${i}"]`)!;
                    document.elementFromPoint = (x, y) => x === screen.clientX && y === screen.clientY ? port.querySelector("span")! : null;
                    const listener = (event: MouseEvent) => {
                        const position = { x: (event.clientX - box.left - v.x) / v.k, y: (event.clientY - box.top - v.y) / v.k };
                        const toPort = tableConnectionPort(table, { nodeId: image.id, handleType: "source" }, position, document.elementFromPoint(event.clientX, event.clientY));
                        assert.equal(toPort, `input-${i}`);
                        state = applyCanvasAgentOps(state, [{ type: "connect_nodes", fromNodeId: image.id, toNodeId: table.id, toPort }]);
                    };
                    window.addEventListener("mouseup", listener, { once: true }); await fire(port, mouse("mouseup", screen));
                    assert.ok(state.connections.some((c) => c.fromNodeId === image.id && c.toNodeId === table.id && c.toPort === `input-${i}`));
                }
                assert.equal(state.connections.filter((c) => c.fromNodeId === image.id && c.toNodeId === table.id).length, 5);
            } finally { document.elementFromPoint = priorElementFromPoint; }
        });
        await test("端口近邻回退、其他节点DOM隔离、反向连线保留portId且渲染端点匹配", () => {
            const foreign = document.createElement("div"); foreign.dataset.nodeId = "foreign"; foreign.innerHTML = '<span data-table-port="input-1"><b>1</b></span>';
            for (let i = 1; i <= 5; i++) {
                const world = { x: 400, y: 500 + (i - 3) * 56 }, current: ConnectionHandle = { nodeId: image.id, handleType: "source" };
                assert.equal(tableConnectionPort(table, current, world, null), `input-${i}`);
                assert.equal(tableConnectionPort(table, current, world, foreign.querySelector("b")), `input-${i}`);
                assert.equal(tableConnectionPort(table, { nodeId: table.id, handleType: "target", portId: `input-${i}` }, { x: -1000, y: -1000 }, null), `input-${i}`);
                const curve = connectionCurve({ id: "test", fromNodeId: image.id, toNodeId: table.id, toPort: `input-${i}` }, image, table); assert.deepEqual(curve[3], world);
            }
            assert.equal(tableConnectionPort(llm, { nodeId: image.id, handleType: "source" }, { x: 0, y: 0 }, null), undefined);
        });
        await test("正向连线预览吸附各输入端口，而非固定表格中心", async () => {
            const preview = document.createElement("div"); el.append(preview); const previewRoot = createRoot(preview);
            for (let i = 1; i <= 5; i++) {
                const world = { x: table.position.x, y: 500 + (i - 3) * 56 };
                await act(async () => previewRoot.render(<svg><ActiveConnectionPath node={image} handle={{ nodeId: image.id, handleType: "source" }} mouseWorld={world} target={table} /></svg>));
                assert.ok(preview.querySelector("path")!.getAttribute("d")!.endsWith(`, ${world.x} ${world.y}`));
            }
            await act(async () => previewRoot.unmount()); preview.remove();
        });
        await test("项目实际连线收尾使用mouseup坐标，不再读取恒为0的陈旧指针ref", () => {
            const source = readFileSync("src/pages/canvas/project.tsx", "utf8");
            assert.equal(source.includes("lastConnectionPointer"), false);
            assert.ok(source.includes("connectNodes(currentConnection, dropTarget.nodeId, event.clientX, event.clientY)"));
            assert.ok(source.includes("tableConnectionPort(target, current, world, pointedElement)"));
            assert.ok(source.includes("const world = screenToCanvas(clientX, clientY)"));
            assert.ok(source.includes("const curve = connectionCurve(connection, from, to), xs = curve.map"));
        });
        await test("项目开始切线前取消正在执行的聚焦动画，避免手势中viewport漂移", async () => {
            const source = readFileSync("src/pages/canvas/project.tsx", "utf8"), callbackSource = source.match(/onConnectionCutStart=\{\(event\) => \{([\s\S]*?)\}\}/)?.[1];
            assert.ok(callbackSource);
            const focusAnimRef = { current: null as number | null }; let animationFrames = 0, starts = 0;
            const actualCallback = new Function("event", "referencePickerNodeId", "connectingParams", "focusAnimRef", "cancelAnimationFrame", "connectionCutter", callbackSource);
            const frame = () => { animationFrames++; focusAnimRef.current = requestAnimationFrame(frame); };
            focusAnimRef.current = requestAnimationFrame(frame); await tick(25); assert.ok(animationFrames > 0);
            const cutter = { start: () => { starts++; assert.equal(focusAnimRef.current, null); return true; } };
            assert.equal(actualCallback(pointer("pointerdown"), null, null, focusAnimRef, cancelAnimationFrame, cutter), true);
            const count = animationFrames; await tick(40); assert.equal(animationFrames, count); assert.equal(starts, 1);
            assert.equal(actualCallback(pointer("pointerdown"), "reference", null, focusAnimRef, cancelAnimationFrame, cutter), false);
            assert.equal(actualCallback(pointer("pointerdown"), null, { nodeId: "connecting" }, focusAnimRef, cancelAnimationFrame, cutter), false); assert.equal(starts, 1);
        });
        await test("上游图片接线与内容更新通过图事件立即刷新表格和并发缩略图", async () => {
            state = applyCanvasAgentOps(state, [
                { type: "delete_connections", ids: state.connections.filter((edge) => edge.fromNodeId === image.id && edge.toNodeId === table.id && edge.toPort !== "input-1").map((edge) => edge.id) },
                { type: "update_node", id: image.id, metadata: { content: "data:image/png;base64,AA==", status: "success" } },
                { type: "add_node", id: "upstream-text", nodeType: "text", metadata: { content: "上游原文" } },
                { type: "connect_nodes", fromNodeId: "upstream-text", toNodeId: table.id, toPort: "input-2" },
            ]);
            // The existing table/batch nodes retain their identities, as they do behind React.memo.
            await act(async () => { render(); await tick(); emitCanvasEvent("canvas:graph-changed"); await tick(); });
            assert.ok(content(table.id).querySelector('img[src="data:image/png;base64,AA=="]'));
            assert.ok(content(batch.id).querySelector('img[src="data:image/png;base64,AA=="]'));
            state = applyCanvasAgentOps(state, [{ type: "update_node", id: image.id, metadata: { content: "data:image/png;base64,AQ==" } }]);
            await act(async () => { emitCanvasEvent("canvas:graph-changed"); await tick(); });
            assert.ok(content(table.id).querySelector('img[src="data:image/png;base64,AQ=="]'));
            assert.ok(content(batch.id).querySelector('img[src="data:image/png;base64,AQ=="]'));
        });
        await test("任意输入列逐行覆盖上游文本并保留连线，空字符串覆盖不回退原文，真实生成读取修改值", async () => {
            const textEditor = () => content(table.id).querySelector<HTMLTextAreaElement>('textarea[aria-label="第 1 行输入 2 文本"]')!;
            assert.equal(textEditor().value, "上游原文");
            const edit = async (text: string) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textEditor(), text); await fire(textEditor(), new Event("input", { bubbles: true })); };
            await edit("本行独立提示词");
            let currentTable = state.nodes.find((node) => node.id === table.id)!;
            assert.equal(readTable(currentTable).inputTexts?.["input-2"]?.[0], "本行独立提示词");
            assert.ok(tableRows(currentTable, state.nodes, state.connections)[0].text.includes("本行独立提示词"));
            assert.ok(!tableRows(currentTable, state.nodes, state.connections)[0].text.includes("上游原文"));
            assert.ok(state.connections.some((edge) => edge.fromNodeId === "upstream-text" && edge.toNodeId === table.id && edge.toPort === "input-2"));
            await edit(""); currentTable = state.nodes.find((node) => node.id === table.id)!;
            assert.ok(!tableRows(currentTable, state.nodes, state.connections)[0].text.includes("上游原文"));
            const moved = deleteTableRow({ ...emptyTable(), inputTexts: { "input-5": { 0: "删除", 1: "保留", 2: "" } } }, 0);
            assert.deepEqual(moved.inputTexts, { "input-5": { 0: "保留", 1: "" } });
        });
        await test("并发独立选择整张卡片切换，复选框仅切换一次，空格拖动卡片不选任务", async () => {
            await act(async () => { host.updateMetadata(batch.id, { tableBatchManualSelection: true, tableBatchSelectedRows: [] }); await tick(); });
            const card = () => content(batch.id).querySelector<HTMLElement>('[role="group"][aria-label="第 1 行输入"]')!;
            const selected = () => state.nodes.find((node) => node.id === batch.id)!.metadata!.tableBatchSelectedRows!;
            await fire(card(), mouse("click")); assert.deepEqual(selected(), [1]);
            await fire(card().querySelector("img")!, mouse("click")); assert.deepEqual(selected(), []);
            await fire(card().querySelector("input")!, mouse("click")); assert.deepEqual(selected(), [1]);
            await fire(card().querySelector("input")!, mouse("click")); assert.deepEqual(selected(), []);
            const old = { ...viewport };
            await fire(window, new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Space", key: " " }));
            await down(card(), { clientX: 500, clientY: 300 }); await fire(window, pointer("pointermove", { clientX: 530, clientY: 320 })); await fire(window, pointer("pointerup")); await fire(card(), mouse("click"));
            await fire(window, new KeyboardEvent("keyup", { bubbles: true, cancelable: true, code: "Space", key: " " }));
            assert.deepEqual(selected(), []); assert.equal(viewport.x, old.x + 30); assert.equal(viewport.y, old.y + 20);
        });
        await test("文本悬停工具条使用真实提示词库，放大编辑16px并同步正文，默认正文20px", async () => {
            Object.assign(globalThis, { CustomEvent: window.CustomEvent, NodeFilter: window.NodeFilter, MutationObserver: window.MutationObserver });
            const previousAssets = useAssetStore.getState().assets;
            try {
                await act(async () => {
                    useAssetStore.setState({ assets: [], hydrated: true });
                    useAssetStore.getState().addAsset({ kind: "text", title: "工作流不可显示", coverUrl: "", tags: [], data: { content: "workflow" }, metadata: { resourceType: "workflow", workflow: { nodes: [], connections: [] } } });
                    state.nodes.push(makeNode("prompt-node", "text", { content: "提示词正文" })); render(); await tick();
                });
                const current = () => nodeEl("prompt-node");
                const button = (text: string) => [...current().querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text)!;
                const normalText = [...current().querySelectorAll<HTMLElement>("div")].find((item) => item.textContent === "提示词正文" && item.style.fontSize)!;
                assert.equal(normalText.style.fontSize, "20px");
                assert.ok(button("放大编辑").closest('[data-canvas-overlay]')!.className.includes("group-hover/node:opacity-100"));
                await fire(button("加入提示词库"), mouse("click"));
                const saved = useAssetStore.getState().assets.find((asset) => asset.metadata?.resourceType === "prompt")!;
                assert.equal(saved.kind, "text"); assert.equal((saved as any).data.content, "提示词正文");
                assert.equal(button("加入提示词库").disabled, true);
                await fire(button("提示词库"), mouse("click"));
                const popup = document.querySelector<HTMLElement>('[aria-label="提示词库内容"]')!; assert.ok(popup);
                assert.ok(!popup.textContent!.includes("工作流不可显示"));
                await act(async () => { host.updateMetadata("prompt-node", { content: "临时内容" }); await tick(); });
                await fire(popup.querySelector("button")!, mouse("click"));
                assert.equal(state.nodes.find((node) => node.id === "prompt-node")!.metadata!.content, "提示词正文");
                await fire(button("放大编辑"), mouse("click"));
                const editor = document.querySelector<HTMLTextAreaElement>(".ant-modal textarea")!;
                assert.ok(editor); assert.equal(editor.style.fontSize, "16px"); assert.equal(editor.value, "提示词正文");
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(editor, "放大编辑同步后的正文");
                await fire(editor, new Event("input", { bubbles: true }));
                assert.equal(state.nodes.find((node) => node.id === "prompt-node")!.metadata!.content, "放大编辑同步后的正文");
                await fire(document.querySelector<HTMLButtonElement>(".ant-modal-close")!, mouse("click"));
            } finally { await act(async () => { useAssetStore.setState({ assets: previousAssets }); await tick(); }); }
        });        console.log(`Workflow drag and ports: ${passed}/${passed} passed (real React DOM events; jsdom layout/hit-testing supplied, no live API)`);
    } finally { await act(async () => root.unmount()); el.remove(); globalThis.fetch = network; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
