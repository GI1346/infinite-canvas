import { TEXT_NODE_DEFAULT_SIZE } from "./canvas-node-size";
import { nanoid } from "nanoid";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import { channelItems, TABLE_TYPE, type DxTable, type DxInputItem } from "@/lib/canvas/dxos-table";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

export const LLM_TYPE = "dxos:llm";
export type LlmInputGroup = { id: string; label: string; sourceName: string; sourceNodeId: string; references: string[]; mediaNodeIds: string[] };
export type LlmInputPreview = { id: string; type: "image" | "text"; title: string; content: string; storageKey?: string };
export type LlmInputs = { references: string[]; text: string; imageNodeIds: string[]; groups: LlmInputGroup[]; previews?: LlmInputPreview[] };

export function collectLlmInputs(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], withPreviews = false): LlmInputs {
    const groups: LlmInputGroup[] = [], previews: LlmInputPreview[] = [], texts = new Set<string>(), mediaIds = new Set<string>(), sourceIds = new Set<string>(), previewIds = new Set<string>();
    for (const edge of connections.filter((connection) => connection.toNodeId === node.id)) {
        const source = nodes.find((candidate) => candidate.id === edge.fromNodeId);
        if (!source || sourceIds.has(source.id)) continue;
        sourceIds.add(source.id);
        const acceptsText = !node.metadata?.tableInputChannels?.find((channel) => channel.id === (edge.toPort || "input-1"))?.imagesOnly;
        const visitSource = (candidate: CanvasNodeData, visited = new Set<string>()) => {
            if (visited.has(candidate.id)) return;
            visited.add(candidate.id);
            if (candidate.type === "audio" || candidate.type === "video") throw new Error("LLM 多模态分析当前只接收图片和文本，不支持音频或视频输入；请移除对应连线");
            if (candidate.type === "group") nodes.filter((child) => child.metadata?.groupId === candidate.id).forEach((child) => visitSource(child, visited));
            if (candidate.type === "text" && acceptsText) {
                const meta = candidate.metadata, primaryId = meta?.primaryTextId || meta?.texts?.[0]?.id;
                const primary = meta?.texts?.find((item) => item.id === primaryId);
                const text = primary ? primary.content : meta?.content || meta?.prompt || "";
                if (text.trim()) texts.add(text.trim());
                if (withPreviews && !previewIds.has(candidate.id)) {
                    previewIds.add(candidate.id);
                    previews.push({ id: candidate.id, type: "text", title: candidate.title || "文本", content: text });
                }
            }
        };
        visitSource(source);
        const items = channelItems(node, edge.toPort || "input-1", nodes, [edge]);
        const images = items.filter((item): item is Extract<DxInputItem, { type: "media" }> => item.type === "media" && item.mediaType === "image" && !mediaIds.has(item.nodeId));
        if (!images.length) continue;
        images.forEach((image) => {
            mediaIds.add(image.nodeId);
            if (withPreviews) previews.push({ id: image.nodeId, type: "image", title: image.title || "图片", content: image.url, storageKey: image.storageKey });
        });
        groups.push({ id: "input-" + (groups.length + 1), label: String.fromCharCode(65 + groups.length), sourceName: source.title || (source.type === "group" ? "图片组" : "图片"), sourceNodeId: source.id, references: images.map((image) => image.url), mediaNodeIds: images.map((image) => image.nodeId) });
    }
    return {
        references: groups.flatMap((group) => group.references), text: [...texts].join("\n\n"), groups, ...(withPreviews ? { previews } : {}),
        imageNodeIds: nodes.filter((source) => source.type === "image" && (mediaIds.has(source.id) || source.metadata?.images?.some((image) => mediaIds.has(source.id + ":" + image.id)))).map((source) => source.id),
    };
}

export function buildLlmPrompt(inputs: LlmInputs, prompt = "") {
    const hierarchy = inputs.groups.length ? [
        "输入素材层级（先按来源通道理解，再按通道内顺序理解）：",
        ...inputs.groups.map((group, index) => "输入" + (index + 1) + "（输入" + group.label + "）：" + (group.references.length > 1 ? "图片组，共 " + group.references.length + " 张" : "单图") + "；来源“" + group.sourceName + "”；包含 " + group.references.map((_, image) => "输入" + (index + 1) + "-第" + (image + 1) + "张").join("、")),
        "引用规则：“输入2/图2/第二个输入”指第二个来源通道；“输入1内第2张/组内第2张”才指组内图片，不要按扁平顺序猜测。按用户动词及指代判断目标主体与风格参考，不能仅凭图片数量判断角色。",
    ].join("\n") : "";
    return [inputs.text, prompt.trim(), hierarchy].filter(Boolean).join("\n\n");
}

export function parseLlmTable(text: string): { table: DxTable; summary?: string } {
    const raw = text.trim(), fence = String.fromCharCode(96).repeat(3);
    const fenced = raw.match(new RegExp("^" + fence + "(?:json)?\\s*([\\s\\S]*?)" + fence + "$", "i"));
    let value: unknown;
    try { value = JSON.parse(fenced ? fenced[1].trim() : raw); }
    catch { throw new Error("模型未返回合法的多维表格 JSON，请调整提示词后重试"); }
    const output = Array.isArray(value) ? { rows: value } : value;
    if (!output || typeof output !== "object" || !("rows" in output) || !Array.isArray(output.rows)) throw new Error("多维表格结果需要包含 rows 数组");
    const summary = "summary" in output ? output.summary : undefined;
    if (summary !== undefined && typeof summary !== "string") throw new Error("多维表格的 summary 必须是文字");
    const base = { kind: "table" as const, version: 1 as const, selectedRows: [], mergedGroups: [] };
    if ("kind" in output) {
        const { kind, version, columns, rows } = output as Partial<DxTable>;
        if (kind !== "table" || version !== 1 || !Array.isArray(columns) || !columns.length || !columns.every((column) => typeof column === "string" && column.trim()) || !rows?.every((row) => Array.isArray(row) && row.length === columns.length && row.every((cell) => typeof cell === "string"))) throw new Error("旧版表格需要 kind=table、version=1、非空列名及长度与列数一致的字符串行");
        return { table: { ...base, columns, rows }, summary: summary?.trim() || undefined };
    }
    const rows = (output.rows as unknown[]).map((row, index) => {
        if (!row || typeof row !== "object" || !("title" in row) || !("prompt" in row) || typeof row.title !== "string" || typeof row.prompt !== "string" || !row.title.trim() || !row.prompt.trim()) throw new Error(`多维表格第 ${index + 1} 行需要非空的 title 和 prompt`);
        return [row.title.trim(), row.prompt.trim()];
    });
    return { table: { ...base, columns: ["图片名称与比例", "提示词"], rows }, summary: summary?.trim() || undefined };
}

export const llmTableSystemPrompt = [
    '只输出一个严格的 JSON 对象，不要代码围栏、Markdown 表格或 JSON 外的说明。通用格式：{"summary":"前置分析、策划总纲与统一规范（纯文字）","rows":[{"title":"图片名称与比例","prompt":"该图可独立生图的完整提示词"}]}。无论题材或用户提示词中的排版要求，均使用此结构。',
    "rows 中每项必须且只能对应一张实际需要生成的图片。遵守用户指定的数量、分组及顺序：如需 5 张主图和 10 张详情页，rows 必须恰好 15 项，第 1 项直接是主图1，第 6 项是详情页1。若未指定数量，按实际要求的画面拆分；明确只需分析、不生成图片时，rows 为 []。",
    "产品分析、核心卖点、方案总览、统一视觉规范、统一正负面提示词等非画面内容只能写入 summary，禁止把这些章节、标题、分类说明或占位符作为 rows 项。没有摘要时，summary 写空字符串。",
    "每项 title 写明该图的名称和有要求的比例；prompt 写成独立完整、可直接生图的提示词，将适用的统一风格、字体、画质与正负面要求融合进该项，不要写‘同上’或要求读取 summary。区分目标主体与风格参考，仅迁移用户要求的元素。原图由独立输入通道保留，不输出图片 URL。",
].join("\n");

export function buildLlmOutputOps(node: CanvasNodeData, mode: "text" | "list", text: string, inputs: LlmInputs, nodes: CanvasNodeData[], connections: CanvasConnection[], outputId = nanoid()): { outputId: string; ops: CanvasAgentOp[]; summary?: string } {
    const downstreamIds = new Set(connections.filter((edge) => edge.fromNodeId === node.id).map((edge) => edge.toNodeId));
    const y = Math.max(node.position.y, ...nodes.filter((source) => downstreamIds.has(source.id)).map((source) => source.position.y + source.height + 42));
    const listResult = mode === "list" ? parseLlmTable(text) : null;
    const table = listResult?.table;
    const groups = inputs.groups.filter((group) => nodes.some((source) => source.id === group.sourceNodeId));
    const ops: CanvasAgentOp[] = [
        { type: "add_node", id: outputId, nodeType: table ? TABLE_TYPE : "text", title: table ? "LLM 输出列表" : "LLM 输出文本", position: { x: node.position.x + node.width + 100, y }, width: table ? 700 : TEXT_NODE_DEFAULT_SIZE.width, height: table ? 600 : TEXT_NODE_DEFAULT_SIZE.height, metadata: table ? { table, tableRowsFromData: true, tableInputChannels: groups.length ? groups.map((group) => ({ id: group.id, mode: group.references.length > 1 ? "sequence" : "shared", imagesOnly: true, mediaNodeIds: group.mediaNodeIds })) : [{ id: "input-1" }], status: "success" } : { content: text, status: "success" } },
        // Keep flow JSON separate from editable table input channels.
        { type: "connect_nodes", fromNodeId: node.id, toNodeId: outputId, ...(table ? { toPort: "llm-output" } : {}) },
    ];
    if (table) groups.forEach((group) => ops.push({ type: "connect_nodes", fromNodeId: group.sourceNodeId, toNodeId: outputId, toPort: group.id }));
    return { outputId, ops, summary: listResult?.summary };
}
