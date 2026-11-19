import { nanoid } from "nanoid";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";
import { fitNodeSize } from "./canvas-node-size";

// A result is immutable during a fresh generation; only its new sibling owns the request.
export function createGenerationBranch(source: CanvasNodeData | undefined, nodes: CanvasNodeData[], connections: CanvasConnection[], config: AiConfig, mode: CanvasGenerationMode, prompt: string, viewport?: { x: number; y: number; k: number; width: number; height: number }) {
    if (!source || source.type !== mode || !source.metadata?.content) return null;
    const old = source.metadata;
    // 同一原始节点派生出的所有结果共享 generationOriginId，槽位号决定第几排第几列。
    // 这样无论从哪个结果再次运行，新节点都接在这一系列末尾；画布上其他无关节点、
    // 以及旧版纵向堆叠的结果都不会把新节点带偏。
    const originId = old.generationOriginId || source.id;
    const origin = nodes.find((item) => item.id === originId) || source;
    const metadata: CanvasNodeMetadata = {
        prompt, composerContent: prompt, status: "idle", generationMode: mode,
        ...(mode === "image" ? { presetCamera: old.presetCamera, presetPalette: old.presetPalette, presetStyle: old.presetStyle, presetCustomPalettes: old.presetCustomPalettes } : {}),
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
        generationOriginId: originId, generationSlot: 0,
    };
    const dimensions = mode === "image" && !old.imageSizeManual && !old.freeResize
        ? fitNodeSize(old.naturalWidth || source.width, old.naturalHeight || source.height)
        : { width: source.width, height: source.height };
    // 结果按 4 列网格向右排：接在同一行最右结果的右边，满 4 个换到下一排，并对齐第一列。
    const COLUMNS = 4;
    const COL_GAP = 24;
    const ROW_GAP = 32;
    const isGroup = (item: CanvasNodeData) => item.type === CanvasNodeType.Group;
    const right = (item: CanvasNodeData) => item.position.x + item.width;
    const bottom = (item: CanvasNodeData) => item.position.y + item.height;
    const rowOf = (item: CanvasNodeData) => Math.floor((item.metadata?.generationSlot || 0) / COLUMNS);
    // 系列包含持有第一张图的原始节点本身（占第 1 个槽位），这样每排正好 4 张图，第 5 张换排。
    const series = nodes.filter((item) => !isGroup(item) && (item.id === originId || item.metadata?.generationOriginId === originId));
    const slot = series.length;
    const rowIndex = Math.floor(slot / COLUMNS);
    const columnIndex = slot % COLUMNS;
    const rowMembers = series.filter((item) => rowOf(item) === rowIndex).sort((a, b) => a.position.x - b.position.x);
    // 第一列以「第 1 排最左节点」为基准，换排后第 5 个正好落在第 1 个正下方。
    const firstColumn = series.filter((item) => rowOf(item) === 0).sort((a, b) => a.position.x - b.position.x)[0];
    const baseX = firstColumn ? firstColumn.position.x : origin.position.x;
    // 新节点贴在该排最右节点的右侧平行位置（从最新结果再次运行时即它的右边）。
    const anchor = rowMembers[rowMembers.length - 1];
    let x = anchor ? right(anchor) + COL_GAP : baseX;
    // 第一排跟随该排实际 y（用户可能整体挪过），其余排接在上一排最底部下面。
    let y: number;
    if (rowIndex === 0) {
        y = anchor?.position.y ?? origin.position.y;
    } else {
        const upper = series.filter((item) => rowOf(item) === rowIndex - 1);
        y = upper.length ? Math.max(...upper.map(bottom)) + ROW_GAP : origin.position.y;
    }
    // 手动挪动的节点可能仍占着这一格，继续向右挪到真正的空位。
    for (let guard = 0; guard <= nodes.length; guard += 1) {
        const hit = nodes.find((item) => !isGroup(item)
            && item.position.x < x + dimensions.width + 32 && right(item) + 32 > x
            && item.position.y < y + dimensions.height + 32 && bottom(item) + 32 > y);
        if (!hit) break;
        x = right(hit) + COL_GAP;
    }
    // 生成结果永远落在当前可见视野内：完全跑到视口外的结果，按轴夹回安全区。
    if (viewport) {
        const margin = 24;
        const left = -viewport.x / viewport.k + margin;
        const top = -viewport.y / viewport.k + margin;
        const rightEdge = (-viewport.x + viewport.width) / viewport.k - dimensions.width - margin;
        const bottomEdge = (-viewport.y + viewport.height) / viewport.k - dimensions.height - margin;
        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
        if (x + dimensions.width < left || x > rightEdge) x = clamp(x, left, rightEdge);
        if (y + dimensions.height < top || y > bottomEdge) y = clamp(y, top, bottomEdge);
    }
    metadata.generationSlot = slot;
    const position = { x, y };
    const node: CanvasNodeData = { id: nanoid(), type: source.type, title: source.title, position, ...dimensions, metadata };
    const inputs = connections.filter((edge) => edge.toNodeId === source.id).map((edge) => ({ ...edge, id: nanoid(), toNodeId: node.id }));
    // Imported images/text still need their original content for editing. Generated images use saved input references instead of turning into image-to-image requests.
    if ((mode === "image" && !old.generationType) || (mode === "text" && !old.model)) inputs.push({ id: nanoid(), fromNodeId: source.id, toNodeId: node.id });
    return { node, connections: inputs, savedImageInputs: mode === "image" && Boolean(old.generationType) };
}
