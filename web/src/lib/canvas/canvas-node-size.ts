import type { CanvasNodeData } from "@/types/canvas";

// 生成节点配置面板的实际宽度与内容的自然布局宽度。
export const NODE_PANEL_WIDTH = 700;
export const NODE_PANEL_CONTENT_WIDTH = 680;
export const IMAGE_NODE_MAX_EDGE = 640;
/** 画布节点统一基准宽度：拖入图片、生成结果、新建节点都按这个宽度对齐。 */
export const UNIFIED_NODE_WIDTH = 240;
export const UNIFIED_NODE_SQUARE_SIZE = 240;
const UNIFIED_NODE_MIN_HEIGHT = 120;
const UNIFIED_NODE_MAX_HEIGHT = 720;
// 画布内所有节点的默认卡片尺寸统一到同一档，新建时看起来整齐一致。
export const CANVAS_NODE_DEFAULT_SIZE = { width: UNIFIED_NODE_WIDTH, height: UNIFIED_NODE_WIDTH };
export const CONFIG_NODE_DEFAULT_SIZE = CANVAS_NODE_DEFAULT_SIZE;
/** LLM 多模态分析这类内容型面板用紧凑尺寸，避免大面积空白。 */
export const LLM_NODE_DEFAULT_SIZE = { width: 330, height: 360 };
export const TEXT_NODE_DEFAULT_SIZE = CANVAS_NODE_DEFAULT_SIZE;

/** 宽度钉死 240，高度按比例算，并钳在 120~720 之间，极端比例也不会有超长卡片。 */
function widthDrivenSize(ratio: number) {
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    return { width: UNIFIED_NODE_WIDTH, height: Math.min(UNIFIED_NODE_MAX_HEIGHT, Math.max(UNIFIED_NODE_MIN_HEIGHT, Math.round(UNIFIED_NODE_WIDTH / safeRatio))) };
}

/** 图片统一尺寸：宽度 240，高度按真实宽高比自适应。 */
export function unifiedImageNodeSize(width: number, height: number) {
    return widthDrivenSize(Math.max(1, width) / Math.max(1, height));
}

/** 不传上限时按统一宽度算（拖入图片 / 生成结果），传了上限仍按原来的等比缩放。 */
export function fitNodeSize(width: number, height: number, maxWidth?: number, maxHeight?: number) {
    if (maxWidth === undefined && maxHeight === undefined) return unifiedImageNodeSize(width, height);
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = Math.min(1, (maxWidth ?? IMAGE_NODE_MAX_EDGE) / w, (maxHeight ?? IMAGE_NODE_MAX_EDGE) / h);
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
 * 生成节点卡片按所选比例变形：宽度固定 240（和拖入图片一致），高度按比例延伸。
 * 「自动」或无比例保持正方形。
 */
export function configNodeSize(aspectRatio?: string) {
    const match = aspectRatio?.match(/^(\d+)(?:x|:)(\d+)/);
    if (!match) return { ...CONFIG_NODE_DEFAULT_SIZE };
    return widthDrivenSize(Math.min(16, Math.max(1 / 16, Number(match[1]) / Math.max(1, Number(match[2])))));
}

// Fresh generated results share the import scale; explicit resizes and existing images keep their geometry.
export function generatedImageNodeSize(width: number, height: number, node: CanvasNodeData, preserveSize = false) {
    if (node.metadata?.imageSizeManual || node.metadata?.freeResize) return { width: node.width, height: node.height };
    if (preserveSize || node.metadata?.content) {
        const edge = Math.max(node.width, node.height);
        return fitNodeSize(width, height, edge, edge);
    }
    return unifiedImageNodeSize(width, height);
}
