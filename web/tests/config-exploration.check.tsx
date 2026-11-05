import assert from "node:assert/strict";
import React, { act, createRef, useState } from "react";
import { ConfigProvider } from "antd";
import { createRoot } from "react-dom/client";
import { CanvasConfigNodePanel } from "../src/components/canvas/canvas-config-node-panel";
import { InfiniteCanvas } from "../src/components/canvas/infinite-canvas";
import { buildNodeGenerationInputs, buildNodeGenerationContext } from "../src/components/canvas/canvas-node-generation";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "../src/types/canvas";

Object.defineProperty(globalThis, "DocumentFragment", { value: window.DocumentFragment, configurable: true });
HTMLElement.prototype.scrollIntoView = () => {};
const make = (id: string, type = CanvasNodeType.Image): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 640, height: 640, metadata: { content: type === CanvasNodeType.Image ? "data:image/png;base64," + id : "上游文字 " + id } });
const refs = [1, 2, 3, 4, 5].map((i) => make("image" + i));
refs.push(make("text1", CanvasNodeType.Text));
let config = { ...make("config", CanvasNodeType.Config), metadata: { composerContent: "", referenceNodeOrder: refs.map((node) => node.id) } } as CanvasNodeData;
let nodes = [...refs, config], viewport = { x: 0, y: 0, k: 1 }, selections: string[] = [], drags = 0;
const edges = refs.map((node) => ({ id: node.id, fromNodeId: node.id, toNodeId: config.id }));
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host), canvasRef = createRef<HTMLDivElement>();
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
const fire = async (target: EventTarget, event: Event) => { await act(async () => { target.dispatchEvent(event); await tick(); }); };
function Harness() {
    const [, render] = useState(0);
    const patch = (_: string, patch: Partial<CanvasNodeMetadata>) => { config = { ...config, metadata: { ...config.metadata, ...patch } }; nodes = [...refs, config]; render((n) => n + 1); };
    return <InfiniteCanvas containerRef={canvasRef} viewport={viewport} tool="select" onViewportChange={(next) => { viewport = next; render((n) => n + 1); }} onCanvasMouseDown={() => { drags++; }}>
        <div data-node-id="config" style={{ width: 540, height: 480 }}><CanvasConfigNodePanel node={config} nodes={nodes} inputs={buildNodeGenerationInputs(config.id, nodes, edges)} connectedNodes={refs} isRunning={false} onConfigChange={patch} onGenerate={() => { throw Error("No paid calls"); }} onStop={() => {}} onDisconnectReference={() => {}} onStartReferenceSelection={(id) => selections.push(id)} /></div>
    </InfiniteCanvas>;
}
const editor = () => document.querySelector<HTMLElement>('[aria-label="生成配置提示词"]')!;
const button = (label: string) => document.querySelector<HTMLButtonElement>('[aria-label="' + label + '"]')!;
async function input(html: string) { await act(async () => { editor().focus(); editor().innerHTML = html; editor().dispatchEvent(new Event("input", { bubbles: true })); await tick(); }); }
async function mouseClick(target: HTMLElement) {
    for (const event of [new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1 }), new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }), new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0, pointerId: 1 }), new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }), new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })]) await fire(target, event);
}
async function main() {
    const network = globalThis.fetch;
    globalThis.fetch = async () => { throw Error("Offline only"); };
    try {
        await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}><Harness /></ConfigProvider>));
        await input("第一行<div>第二行</div>");
        assert.equal(config.metadata?.composerContent, "第一行\n第二行"); console.log("PASS config multiline");
        await input("第一行<div><br></div><div>第三行</div>");
        assert.equal(config.metadata?.composerContent, "第一行\n\n第三行"); console.log("PASS config blank line");
        await mouseClick(button("放大编辑生成配置"));
        assert.ok(document.querySelector('[role="dialog"]'));
        assert.equal(editor().textContent, "第一行\n\n第三行");
        assert.equal(document.querySelectorAll('[data-reference-node-id]').length, 6);
        await mouseClick(Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((el) => el.title === "从画布选择参考节点")!);
        assert.deepEqual(selections, ["config"]); console.log("PASS close editor for canvas selection");
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
        assert.equal(Boolean(document.querySelector('[role="dialog"] [data-config-composer]')), false);
        await input("@");
        const range = document.createRange(); range.selectNodeContents(editor()); range.collapse(false);
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        await fire(editor(), new KeyboardEvent("keydown", { key: "@", bubbles: true }));
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
        const candidate = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-canvas-overlay] button')).find((el) => el.textContent?.replace(/\s/g, "").includes("图片5"))!;
        assert.ok(candidate, "all five upstream images remain selectable");
        assert.equal(canvasRef.current!.contains(candidate), false, "mention menu is outside clipped node");
        const before = { ...viewport }, priorDrags = drags;
        await mouseClick(candidate);
        assert.match(config.metadata!.composerContent!, /@\[node:image5\]/);
        assert.deepEqual(viewport, before); assert.equal(drags, priorDrags);
        const order = ["image5", "image1", "image2", "image3", "image4", "text1"];
        const source = document.querySelector<HTMLElement>('[data-reference-node-id="image5"]')!, target = document.querySelector<HTMLElement>('[data-reference-node-id="image1"]')!;
        const dragEvent = (kind: string) => { const event = new Event(kind, { bubbles: true, cancelable: true }); Object.defineProperty(event, "dataTransfer", { value: { setData() {}, effectAllowed: "", dropEffect: "" } }); return event; };
        await fire(source, dragEvent("dragstart")); await fire(target, dragEvent("dragover")); await fire(target, dragEvent("drop"));
        assert.deepEqual(config.metadata?.referenceNodeOrder, order);
        const context = buildNodeGenerationContext(config.id, nodes, edges, config.metadata!.composerContent!);
        assert.deepEqual(context.referenceImages.map((image) => image.id), order.slice(0, 5));
        assert.ok(context.prompt.includes("上游文字 text1"));
        console.log("PASS generation config: native multiline/blank lines, expanded sync/upstream thumbnails, close before canvas selection, five-item Portal full mouse sequence, no canvas mutation, drag order and actual request input order (offline)");
    } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = network; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
