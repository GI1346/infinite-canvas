import type { CanvasNodeData } from "@/types/canvas";

export const IMAGE_NODE_MAX_EDGE = 640;
// 画布内所有节点的默认卡片尺寸统一到同一档，新建时看起来整齐一致。
export const CANVAS_NODE_DEFAULT_SIZE = { width: Math.ceil(IMAGE_NODE_MAX_EDGE * 4 / 3), height: Math.ceil(IMAGE_NODE_MAX_EDGE * 4 / 3) };
export const CONFIG_NODE_DEFAULT_SIZE = CANVAS_NODE_DEFAULT_SIZE;
export const LLM_NODE_DEFAULT_SIZE = CANVAS_NODE_DEFAULT_SIZE;
export const TEXT_NODE_DEFAULT_SIZE = CANVAS_NODE_DEFAULT_SIZE;

export function fitNodeSize(width: number, height: number, maxWidth = IMAGE_NODE_MAX_EDGE, maxHeight = IMAGE_NODE_MAX_EDGE) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = Math.min(1, maxWidth / w, maxHeight / h);
    return { width: w * scale, height: h * scale };
}

export function nodeSizeFromRatio(size: string, baseWidth: number, baseHeight: number) {
    const match = size?.match(/^(\d+)(?:x|:)(\d+)/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const ratio = width / Math.max(1, height);
    if (ratio < 0.25 || ratio > 4) return { width: baseWidth, height: baseHeight };
    return ratio >= baseWidth / baseHeight ? { width: baseWidth, height: baseWidth / ratio } : { width: baseHeight * ratio, height: baseHeight };
}

/**
 * 生成节点卡片按所选比例变形：短边固定为卡片默认尺寸（和文本等节点一样大），长边按比例延伸，
 * 长边最多到短边 3 倍，再长就整体缩小、比例不变。「自动」或无比例保持方形。
 */
export function configNodeSize(aspectRatio?: string) {
    const match = aspectRatio?.match(/^(\d+)(?:x|:)(\d+)/);
    if (!match) return { ...CONFIG_NODE_DEFAULT_SIZE };
    const ratio = Math.min(16, Math.max(1 / 16, Number(match[1]) / Math.max(1, Number(match[2]))));
    const short = CONFIG_NODE_DEFAULT_SIZE.width;
    const scale = Math.min(1, (short * 3) / (short * Math.max(ratio, 1 / ratio)));
    return { width: Math.round(short * Math.max(ratio, 1) * scale), height: Math.round(short * Math.max(1 / ratio, 1) * scale) };
}

// Fresh generated results share the import scale; explicit resizes and existing images keep their geometry.
export function generatedImageNodeSize(width: number, height: number, node: CanvasNodeData, preserveSize = false) {
    if (node.metadata?.imageSizeManual || node.metadata?.freeResize) return { width: node.width, height: node.height };
    const edge = Math.max(node.width, node.height);
    return preserveSize || node.metadata?.content ? fitNodeSize(width, height, edge, edge) : fitNodeSize(width, height);
}
