import { getNodeSpec } from "@/constant/canvas";
import { markNodeCreated } from "@/lib/canvas/canvas-node-creation";
import { configNodeSize } from "@/lib/canvas/canvas-node-size";
import { computeVideoSize } from "@/lib/media-size";
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
    // 新建空视频节点默认显式写入 16:9 (720p)，避免继承全局图片 1:1 尺寸导致显示框和比例文字不一致。
    const videoDefaults = type === CanvasNodeType.Video && !metadata?.size ? { vquality: metadata?.vquality || "720", size: computeVideoSize(metadata?.vquality || "720", "16:9") } : undefined;
    const initialMetadata = { ...spec.metadata, ...remembered, ...videoDefaults, ...metadata };
    // 生成节点和空视频节点创建时即按所选比例匹配显示框尺寸。
    const initialRatio = initialMetadata.imageAspectRatio ?? (typeof initialMetadata.size === "string" ? initialMetadata.size : undefined);
    const dimensions = isGenerationCard({ type, metadata: initialMetadata }) ? configNodeSize(initialRatio) : spec;
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
    // 未出图的生成节点和空视频节点随所选比例变形，并以中心为锚点收放避免顶住下方配置面板。
    const ratio = patch?.imageAspectRatio ?? (typeof patch?.size === "string" ? patch.size : undefined);
    if (!isGenerationCard(node) || !ratio) return next;
    const size = configNodeSize(ratio);
    return { ...next, ...size, position: { x: node.position.x + (node.width - size.width) / 2, y: node.position.y + (node.height - size.height) / 2 } };
}

/** 空图片节点、生成配置节点以及空视频节点都会随比例同步显示框形状。 */
function isGenerationCard(node: { type: CanvasNodeTypeId; metadata?: CanvasNodeMetadata }) {
    return (
        node.type === CanvasNodeType.Config ||
        (node.type === CanvasNodeType.Image && !node.metadata?.content && !node.metadata?.images?.length) ||
        (node.type === CanvasNodeType.Video && !node.metadata?.content)
    );
}
