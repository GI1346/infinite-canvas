import { nanoid } from "nanoid";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";
import { fitNodeSize } from "./canvas-node-size";

// A result is immutable during a fresh generation; only its new sibling owns the request.
export function createGenerationBranch(source: CanvasNodeData | undefined, nodes: CanvasNodeData[], connections: CanvasConnection[], config: AiConfig, mode: CanvasGenerationMode, prompt: string) {
    if (!source || source.type !== mode || !source.metadata?.content) return null;
    const old = source.metadata;
    const metadata: CanvasNodeMetadata = {
        prompt, composerContent: prompt, status: "idle", generationMode: mode,
        model: config.model, reasoningEffort: config.reasoningEffort,
        size: config.size, imageResolution: config.imageResolution, imageAspectRatio: old.imageAspectRatio,
        quality: config.quality, background: config.background, count: Number(config.count),
        imageCompressionEnabled: old.imageCompressionEnabled, imageCompressionResolution: old.imageCompressionResolution, imageCompressionMaxMb: old.imageCompressionMaxMb,
        textCount: old.textCount, fontSize: old.fontSize,
        seconds: config.videoSeconds, vquality: config.vquality, generateAudio: config.videoGenerateAudio,
        watermark: config.videoWatermark, videoMode: config.videoMode,
        audioVoice: config.audioVoice, audioFormat: config.audioFormat, audioSpeed: config.audioSpeed, audioInstructions: config.audioInstructions,
        referenceNodeOrder: old.referenceNodeOrder ? [...old.referenceNodeOrder] : undefined,
        generationType: old.generationType, references: old.references ? [...old.references] : undefined,
        cropContext: old.cropContext ? structuredClone(old.cropContext) : undefined,
        freeResize: old.freeResize, imageSizeManual: old.imageSizeManual,
    };
    const dimensions = mode === "image" && !old.imageSizeManual && !old.freeResize
        ? fitNodeSize(old.naturalWidth || source.width, old.naturalHeight || source.height)
        : { width: source.width, height: source.height };
    // 结果按 4 列网格向右排：接在同一行最右结果的右边，满 4 个换到下一排开头。
    // 以前是同一个 x 往下堆，第二张结果会跑到第一张下面，看起来像是"新节点没出现"。
    const COLUMNS = 4;
    const GAP = 96;
    const ROW_TOLERANCE = 64;
    const isGroup = (item: CanvasNodeData) => item.type === CanvasNodeType.Group;
    const right = (item: CanvasNodeData) => item.position.x + item.width;
    const bottom = (item: CanvasNodeData) => item.position.y + item.height;
    // 结果区：源节点右侧、且不在源节点上方，按 y 聚成若干排。
    const placed = nodes.filter((item) => !isGroup(item)
        && item.position.x >= source.position.x + source.width
        && bottom(item) + ROW_TOLERANCE > source.position.y);
    const rows: CanvasNodeData[][] = [];
    for (const item of [...placed].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)) {
        const row = rows.find((candidate) => Math.abs(candidate[0].position.y - item.position.y) <= ROW_TOLERANCE);
        if (row) row.push(item);
        else rows.push([item]);
    }
    for (const row of rows) row.sort((a, b) => a.position.x - b.position.x);

    const index = placed.length;
    const rowIndex = Math.floor(index / COLUMNS);
    const columnIndex = index % COLUMNS;
    const firstColumnX = source.position.x + source.width + GAP;
    const anchor = columnIndex > 0 ? rows[rowIndex]?.[columnIndex - 1] : undefined;
    let x = anchor ? right(anchor) + GAP : firstColumnX;
    const previousRow = rowIndex > 0 ? rows[rowIndex - 1] : undefined;
    // 第一排跟随已有结果的实际 y（用户可能整体挪过），其余排接在上一排最底部下面。
    let y = rowIndex > 0
        ? (previousRow?.length ? Math.max(...previousRow.map(bottom)) + GAP : source.position.y)
        : (rows[0]?.[0]?.position.y ?? source.position.y);
    // 手动摆放或旧版纵向结果可能仍占着这一格，继续向右挪到真正的空位。
    for (let guard = 0; guard <= nodes.length; guard += 1) {
        const hit = nodes.find((item) => !isGroup(item)
            && item.position.x < x + dimensions.width + 32 && right(item) + 32 > x
            && item.position.y < y + dimensions.height + 32 && bottom(item) + 32 > y);
        if (!hit) break;
        x = right(hit) + GAP;
    }
    const position = { x, y };
    const node: CanvasNodeData = { id: nanoid(), type: source.type, title: source.title, position, ...dimensions, metadata };
    const inputs = connections.filter((edge) => edge.toNodeId === source.id).map((edge) => ({ ...edge, id: nanoid(), toNodeId: node.id }));
    // Imported images/text still need their original content for editing. Generated images use saved input references instead of turning into image-to-image requests.
    if ((mode === "image" && !old.generationType) || (mode === "text" && !old.model)) inputs.push({ id: nanoid(), fromNodeId: source.id, toNodeId: node.id });
    return { node, connections: inputs, savedImageInputs: mode === "image" && Boolean(old.generationType) };
}
