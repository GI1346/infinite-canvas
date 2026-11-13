import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

/**
 * 旧的「生成配置」节点在加载时并成图片节点：配置面板已经挂到图片节点下方的浮层里，
 * 独立节点被移除。节点 id 保持不变，连线因此不会断；位置、尺寸沿用原节点的。
 */
export function migrateConfigNodes(nodes: CanvasNodeData[]): CanvasNodeData[] {
    if (!nodes.some((node) => node.type === CanvasNodeType.Config)) return nodes;
    return nodes.map((node) => {
        if (node.type !== CanvasNodeType.Config) return node;
        const meta = node.metadata || {};
        return {
            ...node,
            type: CanvasNodeType.Image,
            metadata: {
                ...meta,
                // 配置节点的正文先写到 composerContent，图片节点用 prompt 触发生成。
                prompt: meta.prompt || meta.composerContent || "",
                composerContent: meta.composerContent || meta.prompt || "",
            },
        };
    });
}
