import assert from "node:assert/strict";
import axios from "axios";
import { explicitAssistantImageRequirements } from "../src/lib/canvas/assistant-image-parameters";
import { applyCanvasAgentOps, type CanvasAgentSnapshot } from "../src/lib/canvas/canvas-agent-ops";
import { registerBuiltinNodes } from "../src/components/canvas/nodes/builtin-nodes";
import { assistantSystemPrompt } from "../src/services/api/canvas-assistant";
import { executeHarnessCanvasTool } from "../src/services/api/deepseek-harness";
import { requestGeneration } from "../src/services/api/image";
import { relayChatScript } from "../src/services/api/relay-chat";
import { useCanvasAssistantStore, type CanvasAssistantContext } from "../src/stores/use-canvas-assistant-store";
import { defaultConfig, encodeChannelModel, useConfigStore } from "../src/stores/use-config-store";

const imageModel = encodeChannelModel("fixture-image", "gpt-image-2.5-sunburst"), textModel = encodeChannelModel("fixture-text", "chat");
const config = { ...defaultConfig, proxyEnabled: false, imageModel, textModel, models: [imageModel, textModel], channels: [
    { id: "fixture-image", name: "fixture-image", baseUrl: "https://offline-image.test", apiKey: "fixture-not-real", apiFormat: "openai" as const, models: [{ name: "gpt-image-2.5-sunburst", capability: "image" as const }] },
    { id: "fixture-text", name: "fixture-text", baseUrl: "https://offline-text.test", apiKey: "fixture-not-real", apiFormat: "openai" as const, models: [{ name: "chat", capability: "text" as const, script: relayChatScript }] },
] };
const cases: Array<[string, string | undefined]> = [
    ["图像质量最高，2k，2:3", "max"], ["质量最高", "max"], ["图片质量设置为最高", "max"], ["最高画质", "max"], ["最高质量", "max"],
    ["画质：最高", "max"], ["quality=max", "max"], ["quality: MAX", "max"], ["质量 max", "max"], ["质量极高", "xhigh"], ["极高质量", "xhigh"], ["quality xhigh", "xhigh"],
    ["质量高", "high"], ["高质量", "high"], ["quality high", "high"], ["质量中", "medium"], ["质量低", "low"], ["质量自动", "auto"],
    ["不要最高质量", undefined], ["不是质量最高", undefined], ["参考图像质量最高", undefined], ["高质量一张，最高质量一张", undefined],
    ["没有明确质量要求", undefined], ["不要文字，图像质量最高", "max"], ["@[node:quality:质量最高] 生成图片", undefined],
];
for (const [text, expected] of cases) assert.equal(explicitAssistantImageRequirements(text).quality, expected, text);
const dimensions = explicitAssistantImageRequirements("图像质量最高，2k，2:3");
assert.deepEqual(dimensions, { quality: "max", imageResolution: "2k", imageAspectRatio: "2:3" });
assert.equal(explicitAssistantImageRequirements("质量最高，1:1一张，2:3一张").imageAspectRatio, undefined);
assert.deepEqual(explicitAssistantImageRequirements("2k，9:16"), { imageResolution: "2k", imageAspectRatio: "9:16" });

const state = () => useCanvasAssistantStore.getState(), current = () => state().sessions.find(s => s.id === state().currentId)!;
let replies: string[] = [], outgoing: Array<Record<string, unknown>> = [];
const oldFetch = globalThis.fetch, oldAdapter = axios.defaults.adapter;
globalThis.fetch = (async (url, options) => {
    assert.equal(new URL(String(url)).hostname, "offline-text.test");
    const content = replies.shift(); assert.notEqual(content, undefined, "No unplanned LLM request");
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { "content-type": "application/json" } });
}) as typeof fetch;
axios.defaults.adapter = async request => {
    assert.equal(new URL(request.url!).hostname, "offline-image.test", "No real network permitted");
    assert(request.url!.endsWith("/images/generations"));
    outgoing.push(JSON.parse(request.data));
    return { config: request, status: 200, statusText: "OK", headers: {}, data: { data: [{ b64_json: "aW1hZ2U=" }] } };
};
const action = (tool: string, args: unknown) => JSON.stringify({ tool, args });
function fixture(projectId: string) {
    let snapshot: CanvasAgentSnapshot = { projectId, title: "quality", selectedNodeIds: ["image"], viewport: { x: 0, y: 0, k: 1 }, connections: [], nodes: [
        { id: "image", type: "image", title: "image", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { prompt: "rabbit", model: imageModel, quality: "high", size: "1360x2048", imageResolution: "2k", imageAspectRatio: "2:3" } },
        { id: "untouched", type: "text", title: "text", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { prompt: "最高质量", quality: "low" } },
    ] };
    const context: CanvasAssistantContext = { snapshot, getSnapshot: () => snapshot, applyOps: ops => snapshot = applyCanvasAgentOps(snapshot, ops), runNode: async (id, mode) => {
        assert.equal(mode, "image"); const node = snapshot.nodes.find(n => n.id === id)!;
        const result = await requestGeneration({ ...config, ...node.metadata, model: imageModel }, "rabbit");
        const output = { ...node, id: id + "-output", metadata: { ...node.metadata, status: "success" as const, content: result[0].dataUrl, naturalWidth: 1360, naturalHeight: 2048 } };
        snapshot = { ...snapshot, nodes: [...snapshot.nodes, output] }; return output;
    } };
    return context;
}
async function main() {
    registerBuiltinNodes(); useConfigStore.setState({ config });
    assert(assistantSystemPrompt(config, []).includes('max=最高'));
    for (const mode of ["auto", "manual"] as const) {
        await state().clearHistory(); state().setGenerationMode(mode);
        const context = fixture("quality-" + mode); state().setContext(context); await new Promise(resolve => setTimeout(resolve, 25));
        state().setDraft("2k，2:3，图像质量最高");
        replies = [action("update_nodes", { nodeIds: ["image"], parameters: { quality: "high" } }), action("run_nodes", { nodeIds: ["image"] }), action("final", { message: "done" })];
        const start = outgoing.length; await state().send();
        if (mode === "manual") { assert(current().pending); assert.equal(outgoing.length, start); await state().confirm(true); }
        assert.equal(outgoing.length, start + 1, "Exactly one paid-call equivalent, no corrective retry");
        assert.equal(outgoing.at(-1)!.quality, "max", mode + " actual image API JSON");
        assert.equal(outgoing.at(-1)!.size, "1360x2048");
        assert(current().transcript.some(message => typeof message.content === "string" && message.content.includes('"quality":"max"')), "Actual quality returned to Agent");
        assert.equal(context.getSnapshot().nodes.find(node => node.id === "untouched")!.metadata!.quality, "low");
    }
    await state().clearHistory(); const context = fixture("quality-harness"); state().setContext(context); await new Promise(resolve => setTimeout(resolve, 25));
    const call = (requirements: string, quality: string) => executeHarnessCanvasTool({ id: "fixture", projectId: "quality-harness", tool: "run_nodes", args: { nodeIds: ["image"], parameters: { quality }, requirements } }, new AbortController().signal);
    for (const [requirements, expected] of [["图像质量最高，2k，2:3", "max"], ["质量极高", "xhigh"], ["质量高", "high"]]) {
        const start = outgoing.length, result = await call(requirements, "high");
        assert.equal(outgoing.length, start + 1); assert.equal(outgoing.at(-1)!.quality, expected);
        assert.equal((result.value as any).outcomes[0].parameters.quality, expected, "Harness returns actual quality");
    }
    const before = outgoing.length; await call("生成图片", "low"); assert.equal(outgoing.at(-1)!.quality, "low"); assert.equal(outgoing.length, before + 1);
    await state().clearHistory();
    console.log("PASS " + cases.length + " parsing cases; Agent manual/auto + Harness first-call JSON max/xhigh/high, actual quality feedback, preserved dimensions/defaults/unrelated nodes; all requests intercepted, no paid API used.");
}
main().then(() => { globalThis.fetch = oldFetch; axios.defaults.adapter = oldAdapter; process.exit(0); }).catch(error => { console.error(error); globalThis.fetch = oldFetch; axios.defaults.adapter = oldAdapter; process.exit(1); });
