import assert from "node:assert/strict";
import { registerBuiltinNodes } from "../src/components/canvas/nodes/builtin-nodes";
import { applyCanvasAgentOps, type CanvasAgentSnapshot } from "../src/lib/canvas/canvas-agent-ops";
import { assistantRunOutcome, assistantRunReceipt, assistantWorkflowWithSources } from "../src/services/api/canvas-assistant";
import { executeHarnessCanvasTool } from "../src/services/api/deepseek-harness";
import { relayChatScript } from "../src/services/api/relay-chat";
import { useCanvasAssistantStore, type CanvasAssistantContext } from "../src/stores/use-canvas-assistant-store";
import { defaultConfig, encodeChannelModel, useConfigStore } from "../src/stores/use-config-store";
import type { CanvasNodeData } from "../src/types/canvas";

const image = encodeChannelModel("image", "draw"), text = encodeChannelModel("text", "chat");
const node = (id: string, type = "config"): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 200, height: 200, metadata: { model: image, status: "success", content: "blob:old-input", prompt: "fixture" } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
type Outcome = ReturnType<typeof assistantRunOutcome>;
type Receipt = { ok: boolean; outcomes: Outcome[]; notRunNodeIds: string[] };
async function main() {
    registerBuiltinNodes();
    useConfigStore.setState({ config: { ...defaultConfig, proxyEnabled: false, imageModel: image, textModel: text, models: [image, text], channels: [
        { id: "image", name: "Image", apiFormat: "openai", apiKey: "stub", baseUrl: "https://offline.invalid", models: [{ name: "draw", capability: "image" }] },
        { id: "text", name: "Text", apiFormat: "openai", apiKey: "stub", baseUrl: "https://offline.invalid", models: [{ name: "chat", capability: "text", script: relayChatScript }] },
    ] } });
    const state = () => useCanvasAssistantStore.getState();
    const current = () => state().sessions.find((session) => session.id === state().currentId)!;
    await state().clearHistory();
    let graph: CanvasAgentSnapshot = { projectId: "evidence", title: "evidence", nodes: [node("prompt", "text"), node("first"), node("failure"), node("queued")], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
    const sourceAction = assistantWorkflowWithSources({ tool: "apply_workflow", args: { nodes: [{ key: "config", type: "config" }], connections: [] } }, graph, ["prompt"]);
    assert.deepEqual(sourceAction.args.connections, [{ from: "prompt", to: "config" }]);
    const supplied = { tool: "apply_workflow" as const, args: { nodes: [{ key: "config", type: "config" }], connections: [{ from: "prompt", to: "config" }] } };
    assert.equal(assistantWorkflowWithSources(supplied, graph, ["prompt"]), supplied);
    const missing = assistantRunOutcome("first", undefined, graph);
    assert.equal(missing.ok, false); assert.equal(missing.status, "unconfirmed"); assert.equal(missing.hasOutput, false); assert.equal(missing.width, undefined);
    const deleted = assistantRunOutcome("first", node("deleted-output", "image"), graph);
    assert.equal(deleted.ok, false); assert.equal(deleted.exists, false);
    console.log("PASS config automatically links its text source; explicit edges remain; missing/deleted output never borrows a successful old input.");

    let mode: "success" | "missing" | "partial" = "success";
    const runs: string[] = [];
    let activeRuns = 0, maxActiveRuns = 0;
    const context: CanvasAssistantContext = { snapshot: graph, getSnapshot: () => graph, applyOps: (ops) => graph = applyCanvasAgentOps(graph, ops), runNode: async (id) => {
        runs.push(id);
        activeRuns++; maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
        await new Promise((resolve) => setTimeout(resolve, 25)); activeRuns--;
        if (mode === "missing") return undefined;
        if (id === "failure") throw new Error("fixture generation failure");
        const output = { ...node(`${id}-output`, "image"), metadata: { status: "success" as const, content: "blob:new", naturalWidth: 1024, naturalHeight: 1536 } };
        graph = { ...graph, nodes: [...graph.nodes, output] };
        return output;
    } };
    state().setContext(context); await tick();
    const run = (ids: string[]) => JSON.stringify({ tool: "run_nodes", args: { nodeIds: ids } });
    const final = JSON.stringify({ tool: "final", args: { message: "按工具证据反馈" } });
    let responses: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
        const content = responses.shift(); assert.notEqual(content, undefined, "Unexpected real network request");
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
        state().setGenerationMode("auto"); mode = "missing"; responses = [run(["first", "queued"]), final]; state().setDraft("test missing output"); await state().send();
        const receiptOf = () => JSON.parse(current().messages.findLast((message) => message.role === "tool" && message.text.startsWith("生成结果"))!.text.slice("生成结果：".length)) as Receipt;
        assert.equal(receiptOf().ok, false); assert.equal(receiptOf().outcomes[0].hasOutput, false); assert.deepEqual(receiptOf().notRunNodeIds, []); assert.deepEqual(runs.splice(0), ["first", "queued"]);
        mode = "partial"; responses = [run(["first", "failure", "queued"]), final]; state().setDraft("test partial result"); await state().send();
        const standard = receiptOf(); assert.equal(standard.ok, false); assert.equal(standard.outcomes[0].id, "first-output"); assert.equal(standard.outcomes[0].ok, true); assert.equal(standard.outcomes[1].ok, false); assert.match(standard.outcomes[1].error!, /fixture generation failure/); assert.deepEqual(standard.notRunNodeIds, []); assert.deepEqual(runs.splice(0), ["first", "failure", "queued"]);
        assert.equal(maxActiveRuns, 3); assert.equal(standard.outcomes[2].ok, true);
        assert.match(current().messages.findLast((message) => message.role === "assistant")!.text, /成功 2，失败 1/);
        console.log("PASS Agent starts all three targets concurrently and reports two successes plus one failure from evidence.");

        mode = "success"; responses = [run(["queued"]), run(["queued"])]; state().setDraft("test duplicate paid action"); await state().send();
        assert.deepEqual(runs.splice(0), ["queued"]); assert(current().messages.some((message) => message.role === "error" && message.text.includes("阻止重复付费调用")));
        responses = [run(["queued"]), final]; state().setDraft("再次生成 queued"); await state().send(); assert.deepEqual(runs.splice(0), ["queued"]);
        console.log("PASS an identical paid target batch is blocked within one turn; a new user request can generate it again.");

        const call = (ids: string[]) => executeHarnessCanvasTool({ id: "fixture", projectId: graph.projectId, tool: "run_nodes", args: { nodeIds: ids } }, new AbortController().signal);
        mode = "missing"; const absent = (await call(["first", "queued"])).value as Receipt; assert.equal(absent.ok, false); assert.equal(absent.outcomes[0].hasOutput, false); assert.deepEqual(absent.notRunNodeIds, []); assert.deepEqual(runs.splice(0), ["first", "queued"]);
        mode = "partial"; const partial = (await call(["first", "failure", "queued"])).value as Receipt; assert.equal(partial.ok, false); assert.equal(partial.outcomes[0].ok, true); assert.equal(partial.outcomes[1].ok, false); assert.deepEqual(partial.notRunNodeIds, []); assert.deepEqual(runs.splice(0), ["first", "failure", "queued"]);
        assert.equal(partial.outcomes[2].ok, true);
        const batch = { ...node("mixed-output", "image"), metadata: { status: "success" as const, content: "blob:new", images: [
            { id: "good", status: "success" as const, content: "blob:good", naturalWidth: 1024, naturalHeight: 1024, bytes: 1, mimeType: "image/png" },
            { id: "bad", status: "error" as const, content: "", errorDetails: "fixture failed image", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" },
            { id: "empty", status: "success" as const, content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" },
        ] } };
        const outcome = assistantRunOutcome("first", batch, { ...graph, nodes: [...graph.nodes, batch] });
        assert.equal(outcome.ok, false); assert.deepEqual(outcome.images!.map((item) => item.ok), [true, false, false]);
        assert.match(assistantRunReceipt([outcome]).summary, /成功 1，失败 1，未确认 1/);
        console.log("PASS Harness runs every target; a partially successful multi-image node is never reported as fully successful.");

        graph = { ...graph, nodes: [...graph.nodes, node("table", "dxos:table")] }; state().setGenerationMode("manual"); state().setDraft("invalid manual target"); responses = [run(["table"])]; await state().send(); assert(!current().pending); assert(current().messages.some((message) => message.role === "error" && message.text.includes("尚不支持直接运行节点类型"))); assert.deepEqual(runs, []);
        console.log("PASS manual approval validates node types before presenting an unexecutable approval request.");
    } finally { globalThis.fetch = originalFetch; await state().clearHistory(); state().setGenerationMode("manual"); }
}
main().then(() => { console.log("ALL DUAL AGENT EVIDENCE CHECKS PASSED"); process.exit(0); }).catch((error) => { console.error(error); process.exit(1); });
