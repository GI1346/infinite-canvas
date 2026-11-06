import { useAssistantCompressionStore } from "@/stores/use-assistant-compression-store";
import { assistantGraphSummary, assistantRunMode, assistantRunOutcome, assistantRunReceipt, assistantRunTargets, assistantWorkflowWithSources, executeAssistantTool, type AssistantAction, type AssistantToolResult } from "@/services/api/canvas-assistant";
import { explicitAssistantImageRequirements } from "@/lib/canvas/assistant-image-parameters";
import { getNodeDefinition, listNodeDefinitions } from "@/lib/canvas/node-registry";
import { harnessBusyProjects as busyProjects } from "@/lib/canvas/harness-canvas-busy";
import { encodeChannelModel, modelOptionLabel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import type { CanvasAssistantContext } from "@/stores/use-canvas-assistant-store";
import { useCanvasAssistantStore } from "@/stores/use-canvas-assistant-store";
import { useHarnessModelStore } from "@/stores/use-harness-model-store";
import { useHarnessSidebarStore } from "@/stores/use-harness-sidebar-store";
import { ensureHarnessBridge } from "@/lib/harness-browser-bridge";

import { buildCanvasResourceReferences, getGroupResourceNodes, resolveCanvasReferenceImages } from "@/lib/canvas/canvas-resource-references";
import { App } from "antd";
import { recordDiagnostic } from "@/services/diagnostics";

export type HarnessModelsState = { projectId: string; selectedImageModel: string; channels: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> };
export type HarnessCanvasRequest = { id: string; projectId: string; tool: string; args: Record<string, unknown>; imageModel?: string };
export type HarnessCanvasResponse = AssistantToolResult | { error: string };
declare global {
    interface Window {
        blinkflowHarness?: {
            open: (options: { projectId: string; models: HarnessModelsState }) => Promise<{ url: string }>;
            addReferences: (options: { projectId: string; files: Array<{ nodeId: string; name: string; dataUrl: string }> }) => Promise<string>;
            publishSelection: (state: { projectId: string; nodes: Array<{ id: string; title: string; type: string }> } | null) => void;
            publishModels: (state: HarnessModelsState | null) => void;
            onImageModel: (handler: (selection: { projectId: string; imageModel: string }) => void) => () => void;
            onTool: (handler: (request: HarnessCanvasRequest) => void) => () => void;
            onCancel?: (handler: (id: string) => void) => () => void;
            respond: (id: string, result: HarnessCanvasResponse) => void;
        };
    }
}

const tools = new Set(["read_configuration", "read_assets", "read_results", "apply_workflow", "update_nodes", "edit_canvas", "run_nodes"]);
const readTools = new Set(["read_configuration", "read_assets", "read_results"]);
const createdNodes = new Map<string, Set<string>>();

/** Publish IDs and labels only. URLs / keys remain in the canvas request runner. */
export function harnessModelsState(): HarnessModelsState {
    return {
        projectId: useCanvasAssistantStore.getState().context?.getSnapshot().projectId || "",
        selectedImageModel: useHarnessModelStore.getState().imageModel,
        channels: useConfigStore.getState().config.channels.map((channel) => ({ id: channel.id, name: channel.name, models: channel.models.filter((model) => model.capability === "image").map((model) => ({ id: encodeChannelModel(channel.id, model.name), name: model.name })) })).filter((channel) => channel.models.length > 0),
    };
}

export async function openDeepSeekHarness() {
    const context = useCanvasAssistantStore.getState().context;
    if (!context) throw new Error("请先打开一个画布");
    const projectId = context.getSnapshot().projectId;
    useCanvasAssistantStore.getState().setOpen(true);
    useHarnessSidebarStore.setState({ tab: "harness", loading: true, error: "" });
    try {
        const harness = ensureHarnessBridge();
        if (!harness) throw new Error("请通过本地网页预览或桌面画布打开 Harness");
        const models = harnessModelsState();
        harness.publishModels(models);
        const result = await harness.open({ projectId, models });
        if (useCanvasAssistantStore.getState().context?.getSnapshot().projectId !== projectId) throw new Error("画布已切换，请重新打开 Harness");
        useHarnessSidebarStore.setState({ url: result.url, projectId, loading: false, error: "" });
        return result;
    } catch (error) {
        useHarnessSidebarStore.setState({ loading: false, error: error instanceof Error ? error.message : String(error) });
        throw error;
    }
}

/** Use the same validated operations and generation runner as the original canvas Agent. */
export async function executeHarnessCanvasTool(request: HarnessCanvasRequest, signal: AbortSignal): Promise<AssistantToolResult> {
    if (!request || !tools.has(request.tool) || !request.args || typeof request.args !== "object" || Array.isArray(request.args)) throw new Error("无效的 Harness 画布工具请求");
    const sourceContext = useCanvasAssistantStore.getState().context;
    const known = createdNodes.get(request.projectId) || new Set<string>();
    createdNodes.set(request.projectId, known);
    // Only nodes created by this Harness and deliberately selected input can be inspected.
    const context: CanvasAssistantContext | null = sourceContext && { ...sourceContext, applyOps: (ops) => {
        const beforeIds = new Set(sourceContext.getSnapshot().nodes.map((node) => node.id)), after = sourceContext.applyOps(ops);
        after.nodes.forEach((node) => { if (!beforeIds.has(node.id)) known.add(node.id); });
        return after;
    } };
    const assertCurrent = () => {
        if (signal.aborted || !context || useCanvasAssistantStore.getState().context?.getSnapshot().projectId !== request.projectId || context.getSnapshot().projectId !== request.projectId) throw new DOMException("画布已切换或任务已停止，请重新打开当前画布的 Harness", "AbortError");
    };
    assertCurrent();
    if (!context) throw new Error("画布尚未就绪");
    const mutate = !readTools.has(request.tool);
    if (mutate && (busyProjects.has(request.projectId) || useCanvasAssistantStore.getState().sessions.some((session) => session.running || Boolean(session.pending)))) throw new Error("画布助手正在执行任务，请等待完成后再修改同一画布");
    if (mutate) busyProjects.add(request.projectId);
    try {
        const config = useConfigStore.getState().config;
        const selectedImageModel = request.imageModel ?? "";
        const requireImageModel = (model: unknown): string => {
            if (typeof model !== "string" || !model || !selectableModelsByCapability(useConfigStore.getState().config, "image").includes(model)) throw new Error("所选生图模型或渠道不存在，或不支持图片生成，请重新选择；不会改用默认模型或其他渠道");
            return model;
        };
        const snapshot = context.getSnapshot(), selectedIds = snapshot.selectedNodeIds;
        selectedIds.forEach((id) => known.add(id));
        if (request.tool === "read_configuration") {
            return { value: {
                selectedNodeIds: selectedIds,
                references: assistantGraphSummary({ ...snapshot, nodes: snapshot.nodes.filter((node) => selectedIds.includes(node.id)), connections: [], selectedNodeIds: selectedIds }).nodes.map(({ prompt: _prompt, ...node }) => node),
                models: (["text", "image", "video", "audio"] as const).flatMap((kind) => selectableModelsByCapability(config, kind).map((id) => ({ id, kind, label: modelOptionLabel(config, id) }))),
                selectedImageModel,
                defaults: { image: config.imageModel, video: config.videoModel, text: config.textModel, audio: config.audioModel },
                nodeTypes: listNodeDefinitions().map((node) => ({ type: node.type, name: node.title, description: node.description || "", mode: node.useBuiltinPanel?.mode })),
                note: "这里只提供模型配置、节点类型和用户主动选中的引用，不提供整张画布索引。read_assets/read_results 只能使用主动选中或本 Harness 创建、运行的节点，不能遍历画布；需要其他节点请用户先选择。模型 id 必须逐字使用。selectedImageModel 是用户在 Harness 选择的生图默认：未明确指定其他模型时省略工具 model，执行器会使用它；用户明确指定其他生图模型时，apply_workflow.nodes[].model 或 run_nodes.model 填真实完整ID。选中模型失效会报错，不会跨渠道回退。新节点会布局到当前视图中心。生成尺寸用 parameters.imageAspectRatio、imageResolution(1k/2k/4k/auto) 或精确 size(宽x高)，不是显示宽高。文本正文放 apply_workflow.nodes[].prompt；所有图片生成必须使用 type=config（生成配置），已有提示词须用 connections 连接到 config；图片节点只是参考或结果。run_nodes 运行 config 后在旁边新增图片结果，复用原 config 并保留旧结果。run_nodes 才会实际生成。图片质量档位：auto=自动、low=低、medium=中、high=高、xhigh=极高、max=最高。用户说“质量最高”设 quality=\"max\" 表达意图，执行器按所选模型映射最高有效档：GPT Image 2 为 high，2.5/2.6 Sunburst/Flare 为 max；香蕉/Gemini 不发送质量参数，不声称设置了该档位。",
            } };
        }
        let action = { tool: request.tool, args: request.args } as AssistantAction;
        if (action.tool === "apply_workflow") {
            const sourceIds = request.args.sourceNodeIds;
            if (sourceIds !== undefined && (!Array.isArray(sourceIds) || !sourceIds.every((id) => typeof id === "string"))) throw new Error("sourceNodeIds 必须是已有文本节点 ID 数组");
            if (Array.isArray(sourceIds) && sourceIds.some((id) => !context.getSnapshot().nodes.some((node) => node.id === id && node.type === "text"))) throw new Error("sourceNodeIds 引用的文本节点不存在");
            if (Array.isArray(action.args.nodes)) action = { ...action, args: { ...action.args, nodes: action.args.nodes.map((raw) => {
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
                const supplied = raw as Record<string, unknown>;
                // An image tool plan describes a generator; image nodes themselves are immutable results.
                const item = supplied.type === "image" ? { ...supplied, type: "config" } : supplied, type = String(item.type || "");
                const mode = item.mode ?? (type === "image" || type === "dxos:concurrent" ? "image" : getNodeDefinition(type)?.useBuiltinPanel?.mode);
                if (mode !== "image" || type === "blinkflow:fusion") return item;
                if (selectedImageModel) requireImageModel(selectedImageModel);
                const model = item.model === undefined || item.model === "" ? selectedImageModel : requireImageModel(item.model);
                return model ? { ...item, model } : item;
            }) } };
            action = assistantWorkflowWithSources(action, context.getSnapshot(), (sourceIds || []) as string[]);
        }
        if (action.tool !== "run_nodes") {
            const result = await executeAssistantTool(action, context, config, [], signal, [...known], useAssistantCompressionStore.getState().harness);
            assertCurrent();
            if (action.tool === "read_assets" || action.tool === "read_results") ((result.value as { nodes?: Array<{ id: string }> })?.nodes || []).forEach((node) => known.add(node.id));
            if (action.tool === "read_results") {
                const value = result.value as { nodes: Array<Record<string, unknown>> };
                return { ...result, value: { ...value, nodes: value.nodes.map((node) => {
                    const model = context.getSnapshot().nodes.find((item) => item.id === node.id)?.metadata?.model;
                    return { ...node, model, modelLabel: model ? modelOptionLabel(useConfigStore.getState().config, model) : undefined };
                }) } };
            }
            return result;
        }
        let targets = assistantRunTargets(action, context);
        if (!targets.length) throw new Error("请指定需要运行的真实节点 ID");
        // Old conversations can still request an image ID. Route them through a visible config too.
        for (let index = 0; index < targets.length; index++) {
            const source = targets[index];
            if (source.type !== "image") continue;
            const graph = context.getSnapshot();
            const parent = graph.connections.filter((edge) => edge.toNodeId === source.id).map((edge) => graph.nodes.find((node) => node.id === edge.fromNodeId)).find((node) => node?.type === "config");
            if (parent) { targets[index] = parent; continue; }
            const incoming = graph.connections.filter((edge) => edge.toNodeId === source.id);
            const parameters = assistantGraphSummary({ ...graph, nodes: [source] }).nodes[0].parameters;
            const result = await executeAssistantTool({ tool: "apply_workflow", args: {
                nodes: [{ key: "config", type: "config", title: (source.title || "图片") + " · 生成配置", prompt: source.metadata?.composerContent || source.metadata?.prompt || "", model: request.args.model ?? (selectedImageModel || source.metadata?.model || config.imageModel), parameters }],
                connections: incoming.length ? incoming.map((edge) => ({ from: edge.fromNodeId, to: "config", ...(edge.toPort ? { toPort: edge.toPort } : {}) })) : source.metadata?.content || source.metadata?.storageKey ? [{ from: source.id, to: "config" }] : [],
            } }, context, config, [], signal);
            assertCurrent();
            const id = (result.value as { resolvedNodes: Array<{ id: string }> }).resolvedNodes[0].id;
            targets[index] = context.getSnapshot().nodes.find((node) => node.id === id)!;
        }
        targets = [...new Map(targets.map((node) => [node.id, node])).values()];
        action = { ...action, args: { ...action.args, nodeIds: targets.map((node) => node.id) } };
        const modes = targets.map(assistantRunMode);
        const imageIds = targets.filter((node, index) => modes[index] === "image" && node.type !== "blinkflow:fusion").map((node) => node.id);
        const model = request.args.model === undefined ? selectedImageModel : requireImageModel(request.args.model);
        if (request.args.model !== undefined && !imageIds.length) throw new Error("run_nodes.model 只用于图片 API 生成节点，融合或其他类型不使用生图模型");
        if (imageIds.length && selectedImageModel) requireImageModel(selectedImageModel);
        const imageModels = targets.filter((node) => imageIds.includes(node.id)).map((node) => ({ id: node.id, model: requireImageModel(model || node.metadata?.model || config.imageModel) }));
        const parameters = request.args.parameters;
        if (parameters !== undefined && (!parameters || typeof parameters !== "object" || Array.isArray(parameters))) throw new Error("parameters 必须是对象");
        if (request.args.requirements !== undefined && typeof request.args.requirements !== "string") throw new Error("requirements 必须是用户的尺寸和质量要求文字");
        if (request.args.prompt !== undefined && typeof request.args.prompt !== "string") throw new Error("prompt 必须是文字");
        const explicit = explicitAssistantImageRequirements(typeof request.args.requirements === "string" ? request.args.requirements : "");
        // Validate every model before changing any parameters or making the first paid call.
        if (imageModels.length) await executeAssistantTool({ tool: "edit_canvas", args: { action: "update", nodes: imageModels } }, context, config, [], signal);
        assertCurrent();
        if (parameters && Object.keys(parameters).length) await executeAssistantTool({ tool: "update_nodes", args: { nodeIds: targets.map((node) => node.id), parameters } }, context, config, [], signal);
        if (imageIds.length && Object.keys(explicit).length) await executeAssistantTool({ tool: "update_nodes", args: { nodeIds: imageIds, parameters: explicit } }, context, config, [], signal);
        if (imageIds.length) context.applyOps(imageIds.map((id) => ({ type: "update_node", id, metadata: { ...useAssistantCompressionStore.getState().harness } })));
        targets = assistantRunTargets(action, context);
        const outcomes = await Promise.all(targets.map(async (node, index) => {
            assertCurrent();
            try {
                const expectedModel = imageModels.find((item) => item.id === node.id)?.model;
                if (expectedModel && (requireImageModel(expectedModel) !== context.getSnapshot().nodes.find((item) => item.id === node.id)?.metadata?.model)) throw new Error("运行前节点模型已改变，本次未使用其他模型生成，请重新确认");
                const output = await context.runNode(node.id, modes[index], typeof request.args.prompt === "string" ? request.args.prompt : node.metadata?.composerContent || node.metadata?.prompt || "", signal);
                assertCurrent();
                const outcome = assistantRunOutcome(node.id, output, context.getSnapshot());
                if (outcome.exists) known.add(outcome.id);
                return { ...outcome, modelLabel: outcome.model ? modelOptionLabel(useConfigStore.getState().config, outcome.model) : undefined };
            } catch (error) {
                assertCurrent();
                return assistantRunOutcome(node.id, undefined, context.getSnapshot(), error);
            }
        }));
        return { value: { ...assistantRunReceipt(outcomes), note: "全部目标已并发执行。最终逐图结论请直接使用 summary：成功必须存在本次有效产物；失败、未确认分别说明，不把部分成功说成全部完成。以真实 width/height 判断像素，不能把参数当产物。部分失败保留其他结果，不自动再次付费生成。" } };
    } finally { if (mutate) busyProjects.delete(request.projectId); }
}

/** Add only the user's explicit image selection to the current Harness draft. */
export async function addImagesToDeepSeekHarness(nodeIds: string[]) {
    const context = useCanvasAssistantStore.getState().context;
    if (!context) throw new Error("请先打开画布");
    const snapshot = context.getSnapshot();
    const selected = snapshot.nodes.filter((node) => nodeIds.includes(node.id));
    const nodes = [...new Map(selected.flatMap((node) => node.type === "group" ? getGroupResourceNodes(node.id, snapshot.nodes) : [node]).map((node) => [node.id, node])).values()];
    const references = buildCanvasResourceReferences(nodes).filter((item) => item.kind === "image");
    if (!references.length) throw new Error("请选择有内容的图片，空白节点不能作为参考图");
    const resolved = await resolveCanvasReferenceImages(references, nodes);
    const compression = useAssistantCompressionStore.getState().harness;
    const images = compression.imageCompressionEnabled ? await (await import("@/lib/canvas/reference-image-compression")).compressReferenceImages(resolved, compression) : resolved;
    const assertCurrent = () => { if (useCanvasAssistantStore.getState().context?.getSnapshot().projectId !== snapshot.projectId) throw new Error("画布已切换，请重新选择图片"); };
    assertCurrent();
    await openDeepSeekHarness();
    assertCurrent();
    useHarnessSidebarStore.setState((state) => ({ references: [...state.references, { id: crypto.randomUUID(), projectId: snapshot.projectId, files: images.map((image, index) => ({ nodeId: references[index].nodeId, name: references[index].title + " [" + references[index].nodeId + "]", dataUrl: image.dataUrl })) }] }));
    const known = createdNodes.get(snapshot.projectId) || new Set<string>();
    references.forEach((item) => known.add(item.nodeId));
    createdNodes.set(snapshot.projectId, known);
}

export function useAddImagesToHarness() {
    const { message } = App.useApp();
    return (nodeIds: string[]) => { void addImagesToDeepSeekHarness(nodeIds).then(() => message.success("图片已添加到 Harness，请在对话输入框确认后发送")).catch((error) => { recordDiagnostic("添加图片到 Harness", error); message.error(error instanceof Error ? error.message : "添加到 Harness 失败"); }); };
}

/** Publish only deliberately selected node identities, never the full canvas or image bytes. */
export function harnessSelectionState() {
    const snapshot = useCanvasAssistantStore.getState().context?.getSnapshot();
    return snapshot ? { projectId: snapshot.projectId, nodes: snapshot.nodes.filter((node) => snapshot.selectedNodeIds.includes(node.id)).map((node) => ({ id: node.id, title: node.title || node.id, type: node.type })) } : null;
}

export async function resolveHarnessReference(request: HarnessCanvasRequest, signal: AbortSignal): Promise<AssistantToolResult> {
    const context = useCanvasAssistantStore.getState().context, id = request.args.nodeId;
    const assertCurrent = () => { if (signal.aborted || !context || context.getSnapshot().projectId !== request.projectId || useCanvasAssistantStore.getState().context?.getSnapshot().projectId !== request.projectId) throw new Error("画布已切换，请重新引用节点"); };
    assertCurrent();
    const snapshot = context!.getSnapshot(), known = createdNodes.get(request.projectId) || new Set<string>();
    if (typeof id !== "string" || !snapshot.selectedNodeIds.includes(id) && !known.has(id)) throw new Error("请先框选要引用的节点");
    const node = snapshot.nodes.find((node) => node.id === id);
    if (!node) throw new Error("引用节点已删除");
    const reference = buildCanvasResourceReferences([node])[0];
    assertCurrent(); known.add(id); createdNodes.set(request.projectId, known);
    return { value: { id, title: node.title || id, type: node.type, text: reference?.text || "", hasImage: reference?.kind === "image" } };
}
