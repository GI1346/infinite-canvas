import { getNodeSpec, NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { markNodeCreated } from "@/lib/canvas/canvas-node-creation";
import { configNodeSize } from "@/lib/canvas/canvas-node-size";
import { useCanvasImageSettingsStore } from "@/stores/canvas/use-canvas-image-settings-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { UploadedImage } from "@/services/image-storage";
import type { UploadedFile } from "@/services/file-storage";
import type { ReferenceImage } from "@/types/image";
import { CanvasNodeType, type CanvasImageGenerationType, type CanvasNodeData, type CanvasNodeMetadata, type CanvasNodeTypeId, type Position } from "@/types/canvas";

export function createCanvasNode(type: CanvasNodeTypeId, position: Position, metadata?: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    // 图片节点和生成节点共用同一份配置记忆：新建时沿用上一次在配置栏选好的项。
    const remembered = type === CanvasNodeType.Image || type === CanvasNodeType.Config ? useCanvasImageSettingsStore.getState().settings : undefined;
    const initialMetadata = { ...spec.metadata, ...remembered, ...metadata };
    // 生成节点沿用记忆里的比例，所以创建时就按比例给卡片；其它节点仍统一同一张卡片尺寸。
    const dimensions = isGenerationCard({ type, metadata: initialMetadata }) ? configNodeSize(initialMetadata.imageAspectRatio) : spec;
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    markNodeCreated(id);

    return {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - dimensions.width / 2,
            y: position.y - dimensions.height / 2,
        },
        width: dimensions.width,
        height: dimensions.height,
        metadata: initialMetadata,
    };
}

export function imageMetadata(image: UploadedImage): CanvasNodeMetadata {
    return { content: image.url, storageKey: image.storageKey, status: "success", naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

export function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
    return { content: video.url, storageKey: video.storageKey, status: "success", naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType || "video/mp4", durationMs: video.durationMs };
}

export function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
    return { content: audio.url, storageKey: audio.storageKey, status: "success", bytes: audio.bytes, mimeType: audio.mimeType || "audio/mpeg", durationMs: audio.durationMs };
}

export function referenceUrl(image: ReferenceImage) {
    return image.storageKey || image.url || (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined);
}

export function buildImageGenerationMetadata(type: CanvasImageGenerationType, config: AiConfig, count: number, references: ReferenceImage[]): CanvasNodeMetadata {
    return {
        generationType: type,
        model: config.model,
        size: config.size,
        quality: config.quality,
        imageResolution: config.imageResolution,
        ...(config.background ? { background: config.background } : {}),
        count,
        references: references.map(referenceUrl).filter((url): url is string => Boolean(url)),
    };
}

export function buildAudioGenerationMetadata(config: AiConfig): CanvasNodeMetadata {
    return {
        model: config.model,
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: config.audioSpeed,
        audioInstructions: config.audioInstructions,
    };
}

export function applyNodeConfigPatch(node: CanvasNodeData, patch: Partial<CanvasNodeData["metadata"]>) {
    const next = { ...node, metadata: { ...node.metadata, ...(patch || {}) } };
    // 只有还没出图的生成节点跟着比例变形，并且以中心为锚点收放，避免卡片只往下长顶住面板。
    const ratio = patch?.imageAspectRatio ?? (typeof patch?.size === "string" ? patch.size : undefined);
    if (!isGenerationCard(node) || !ratio) return next;
    const size = configNodeSize(ratio);
    return { ...next, ...size, position: { x: node.position.x + (node.width - size.width) / 2, y: node.position.y + (node.height - size.height) / 2 } };
}

/** 空图片节点就是待生成的生成节点（配置 + 比例都挂它上面）。 */
function isGenerationCard(node: { type: CanvasNodeTypeId; metadata?: CanvasNodeMetadata }) {
    return node.type === CanvasNodeType.Config || (node.type === CanvasNodeType.Image && !node.metadata?.content && !node.metadata?.images?.length);
}
