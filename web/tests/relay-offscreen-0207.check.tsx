import assert from "node:assert/strict";
import axios from "axios";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { dxosNodeDefinitions } from "../src/components/canvas/nodes/dxos-workflow-nodes";
import { canvasThemes } from "../src/lib/canvas-theme";
import { applyCanvasAgentOps, type CanvasAgentSnapshot } from "../src/lib/canvas/canvas-agent-ops";
import { isCanvasNodeVisible } from "../src/lib/canvas/canvas-visibility";
import { CONCURRENT_TYPE, TABLE_TYPE, emptyTable, runningTableBatches } from "../src/lib/canvas/dxos-table";
import { createModelChannel, defaultConfig, useConfigStore } from "../src/stores/use-config-store";
import { requestGeneration } from "../src/services/api/image";
import type { CanvasNodeContext } from "../src/types/canvas-plugin";
import type { CanvasNodeData } from "../src/types/canvas";

// Offline end-to-end component/transport regression. No real keys or paid requests.
const original = { adapter: axios.defaults.adapter, timeout: globalThis.setTimeout };
const tick = () => new Promise<void>((resolve) => original.timeout(resolve, 20));
const Content = dxosNodeDefinitions.find((definition) => definition.type === CONCURRENT_TYPE)!.Content!;
const channel = createModelChannel({ id: "offline-image", baseUrl: "https://offline-relay.invalid", apiKey: "synthetic-offline-key", models: [{ name: "synthetic-image", capability: "image" }] });
const config = { ...defaultConfig, channels: [channel], model: "offline-image::synthetic-image", imageModel: "offline-image::synthetic-image" };
const node = (id: string, type: string, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id, type, title: id, position: { x: 40, y: 80 }, width: 400, height: 600, metadata });

async function verify(resolution: "2k" | "4k", manual = false) {
    useConfigStore.setState({ config });
    const batch = node("batch", CONCURRENT_TYPE, { imageAspectRatio: "auto", imageResolution: resolution, size: "auto", model: config.model, tableBatchConcurrency: 2 });
    let state: CanvasAgentSnapshot = { projectId: "offline", title: "offline", nodes: [node("table", TABLE_TYPE, { table: { ...emptyTable(), rows: [["第一行"], ["第二行"]] } }), batch], connections: [{ id: "input", fromNodeId: "table", toNodeId: batch.id }], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
    let render = () => {}, moveOffscreen = () => {}, posts = 0;
    const polls: Array<() => void> = [], signals: AbortSignal[] = [];
    axios.defaults.adapter = async (request) => {
        const response = (data: unknown) => ({ config: request, status: 200, statusText: "OK", headers: {}, data });
        assert.equal(request.headers.Authorization, "Bearer synthetic-offline-key");
        assert.equal(request.url, "https://offline-relay.invalid/v1/images/generations");
        const body = JSON.parse(request.data); assert.equal(body.model, "synthetic-image");
        posts++; signals.push(request.signal as AbortSignal);
        return new Promise((resolve) => polls.push(() => resolve(response({ data: [{ url: "https://offline.invalid/completed.png" }] }))));
    };
    const context = (current: CanvasNodeData): CanvasNodeContext => ({
        node: current, theme: canvasThemes.light, scale: 1, isSelected: false,
        getNode: (id) => state.nodes.find((item) => item.id === id) || null, getNodes: () => state.nodes, getConnections: () => state.connections, getUpstream: () => [], getDownstream: () => [],
        updateMetadata: (metadata) => { state = applyCanvasAgentOps(state, [{ type: "update_node", id: current.id, metadata }]); render(); }, updateNode: () => {},
        applyOps: (ops) => { state = applyCanvasAgentOps(state, ops); render(); }, emit: () => {}, on: () => () => {}, openPanel: () => {}, closePanel: () => {}, storage: { get: async () => null, set: async () => {}, remove: async () => {} },
        ai: { defaultModel: () => config.model, listModels: () => [{ value: config.model, label: "offline" }], generateImage: async (prompt, options) => ({ images: (await requestGeneration({ ...config, size: options?.size || "auto", imageResolution: options?.resolution }, prompt, { signal: options?.signal })).map((image) => image.dataUrl) }), generateText: async () => ({ text: "unused" }), generateVideo: async () => ({ url: "unused", mimeType: "video/mp4" }) },
    });
    function Harness() {
        const [, setVersion] = useState(0), [offscreen, setOffscreen] = useState(false);
        render = () => setVersion((value) => value + 1); moveOffscreen = () => setOffscreen(true);
        const bounds = offscreen ? { left: 10000, top: 10000, right: 11000, bottom: 11000 } : { left: 0, top: 0, right: 1000, bottom: 1000 };
        return <>{state.nodes.filter((item) => item.id === batch.id && isCanvasNodeVisible(item, bounds)).map((item) => <Content key={item.id} ctx={context(item)} />)}</>;
    }
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => { root.render(<Harness />); await tick(); });
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("▶ 运行"))!.click(); await tick(); });
    assert.equal(posts, 2); assert.equal(polls.length, 2); assert(runningTableBatches.has(batch.id));
    await act(async () => { moveOffscreen(); await tick(); });
    assert(host.querySelector('[aria-label="生成分辨率"]'), "active concurrent component must stay mounted after leaving viewport");
    assert(signals.every((signal) => !signal.aborted), "pan/culling must not cancel active generation requests");
    if (manual) { const id = state.nodes.find((item) => item.id === batch.id)!.metadata!.tableBatchRun!.tasks[0].outputIds[0]; state = applyCanvasAgentOps(state, [{ type: "update_node", id, patch: { width: 420, height: 270 }, metadata: { imageSizeManual: true } }]); }
    await act(async () => { polls.forEach((finish) => finish()); await tick(); });
    const run = state.nodes.find((item) => item.id === batch.id)!.metadata!.tableBatchRun!;
    assert.equal(run.state, "completed"); assert(run.tasks.every((task) => task.status === "success")); assert.equal(posts, 2, "completion must not resubmit generation requests");
    for (const task of run.tasks) { const output = state.nodes.find((item) => item.id === task.outputIds[0])!; assert.equal(output.metadata!.status, "success"); assert.equal(output.metadata!.content, "https://offline.invalid/completed.png"); }
    const outputs = run.tasks.map((task) => state.nodes.find((item) => item.id === task.outputIds[0])!);
    for (let i = 0; i < outputs.length; i++) { assert.equal(outputs[i].width, manual && i === 0 ? 420 : 640); assert.equal(outputs[i].height, manual && i === 0 ? 270 : 640); assert.equal(outputs[i].metadata!.naturalWidth, 1024); }
    assert(outputs[1].position.x >= outputs[0].position.x + outputs[0].width + 40 || outputs[1].position.y >= outputs[0].position.y + outputs[0].height + 40, "grid outputs must not overlap horizontally or vertically");
    assert(!runningTableBatches.has(batch.id)); assert.equal(host.querySelector('[aria-label="生成分辨率"]'), null, "completed offscreen component can be culled again");
    await act(async () => root.unmount()); host.remove();
    console.log(`PASS ${resolution.toUpperCase()}+AUTO: 2 standard POSTs, 2 held responses, offscreen pan keeps component/requests alive, 2 completed result nodes, no resubmit, no task endpoint.`);
}
async function main() {
    globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) => original.timeout(callback, ms === 3000 ? 0 : ms, ...args)) as typeof setTimeout;
    try { await verify("2k"); await verify("4k"); await verify("2k", true); }
    finally { axios.defaults.adapter = original.adapter; globalThis.setTimeout = original.timeout; }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
