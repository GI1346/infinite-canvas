import type { CanvasNodeData } from "@/types/canvas";

// 生成节点配置面板的实际宽度与内容的自然布局宽度。
export const NODE_PANEL_WIDTH = 700;
export const NODE_PANEL_CONTENT_WIDTH = 680;
export const IMAGE_NODE_MAX_EDGE = 640;
/** 画布节点统一基准短边（1:1 边长）：横屏定高 240 按比例拉宽，竖屏定宽 240 按比例拉高。 */
export const UNIFIED_NODE_WIDTH = 240;
export const UNIFIED_NODE_SQUARE_SIZE = 240;
/** 极端长宽比防爆护栏（覆盖 21:9、9:1、1:9、16:1 等全部常见及自定义比例而不截断）。 */
const MAX_ASPECT_RATIO = 20;
// 画布内所有节点的默认卡片尺寸统一到同一档，新建时看起来整齐一致。
export const CANVAS_NODE_DEFAULT_SIZE = { width: UNIFIED_NODE_SQUARE_SIZE, height: UNIFIED_NODE_SQUARE_SIZE };
export const CONFIG_NODE_DEFAULT_SIZE = CANVAS_NODE_DEFAULT_SIZE;
export const TEXT_NODE_DEFAULT_SIZE = CANVAS_NODE_DEFAULT_SIZE;

/**
 * 通用短边恒定比例算法（适用于所有内置比例、任意自定义比例及真实图片/视频）：
 * - 方图 (r = 1)：240 × 240
 * - 横屏 (r > 1)：左右两边（高度）恒等于 1:1 的 240，横向长度严格按比例 = round(240 * r)
 * - 竖屏 (r < 1)：上下两边（宽度）恒等于 1:1 的 240，纵向长度严格按比例 = round(240 / r)
 */
function shortEdgeDrivenSize(ratio: number) {
    const safeRatio =
        Number.isFinite(ratio) && ratio > 0
            ? Math.min(MAX_ASPECT_RATIO, Math.max(1 / MAX_ASPECT_RATIO, ratio))
            : 1;
    if (safeRatio >= 1) {
        return { width: Math.round(UNIFIED_NODE_SQUARE_SIZE * safeRatio), height: UNIFIED_NODE_SQUARE_SIZE };
    }
    return { width: UNIFIED_NODE_SQUARE_SIZE, height: Math.round(UNIFIED_NODE_SQUARE_SIZE / safeRatio) };
}

/** 图片/视频统一尺寸：横屏定高 240、竖屏定宽 240，长边按真实宽高比严格展开。 */
export function unifiedImageNodeSize(width: number, height: number) {
    return shortEdgeDrivenSize(Math.max(1, width) / Math.max(1, height));
}

/** 不传上限时按统一短边算法算（拖入图片 / 生成结果），传了上限仍按原来的等比缩放。 */
export function fitNodeSize(width: number, height: number, maxWidth?: number, maxHeight?: number) {
    if (maxWidth === undefined && maxHeight === undefined) return unifiedImageNodeSize(width, height);
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = Math.min(1, (maxWidth ?? IMAGE_NODE_MAX_EDGE) / w, (maxHeight ?? IMAGE_NODE_MAX_EDGE) / h);
    return { width: w * scale, height: h * scale };
}

export function nodeSizeFromRatio(size: string, baseWidth: number, baseHeight: number) {
    const match = size?.trim().match(/^(\d+(?:\.\d+)?)\s*(?:x|:)\s*(\d+(?:\.\d+)?)$/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return null;
    const ratio = width / height;
    if (ratio < 1 / MAX_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) return { width: baseWidth, height: baseHeight };
    return ratio >= baseWidth / baseHeight ? { width: baseWidth, height: baseWidth / ratio } : { width: baseHeight * ratio, height: baseHeight };
}

/**
 * 生成节点 / 空视频节点按所选比例变形（支持所有内置比例与任意整数/小数自定义比例，如 2.39:1、9:1、1:5）：
 * 横屏高度固定 240、竖屏宽度固定 240；「自动」或无比例保持 240×240 正方形。
 */
export function configNodeSize(aspectRatio?: string) {
    const match = aspectRatio?.trim().match(/^(\d+(?:\.\d+)?)\s*(?:x|:)\s*(\d+(?:\.\d+)?)$/i);
    if (!match) return { ...CONFIG_NODE_DEFAULT_SIZE };
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (!w || !h) return { ...CONFIG_NODE_DEFAULT_SIZE };
    return shortEdgeDrivenSize(w / h);
}

// Fresh generated results share the unified short-edge scale; explicit resizes and existing edited images keep their geometry.
export function generatedImageNodeSize(width: number, height: number, node: CanvasNodeData, preserveSize = false) {
    if (node.metadata?.imageSizeManual || node.metadata?.freeResize) return { width: node.width, height: node.height };
    if (node.metadata?.content) {
        const edge = Math.max(node.width, node.height);
        return fitNodeSize(width, height, edge, edge);
    }
    if (preserveSize && node.width !== node.height) {
        return unifiedImageNodeSize(width, height);
    }
    return unifiedImageNodeSize(width, height);
}
