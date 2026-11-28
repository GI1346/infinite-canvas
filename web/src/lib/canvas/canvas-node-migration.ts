import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

/**
 * 旧的「生成配置」节点在加载时并成图片节点；
 * 旧的「LLM 多模态分析 (dxos:llm)」节点在加载时并成文本节点：
 * 节点 id 与连线保持不变，原有提示词、输出模式、模型与结果完整保留。
 */
export function migrateConfigNodes(nodes: CanvasNodeData[]): CanvasNodeData[] {
    if (!nodes.some((node) => node.type === CanvasNodeType.Config || node.type === "dxos:llm")) return nodes;
    return nodes.map((node) => {
        if (node.type === CanvasNodeType.Config) {
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
        }
        if (node.type === "dxos:llm") {
            const meta = node.metadata || {};
            const composerContent = meta.composerContent ?? meta.prompt ?? "";
            return {
                ...node,
                type: CanvasNodeType.Text,
                metadata: {
                    ...meta,
                    composerContent,
                    prompt: meta.prompt ?? composerContent,
                    content: meta.content ?? "",
                    llmOutputMode: meta.llmOutputMode === "list" ? "list" : "text",
                    fontSize: meta.fontSize || 20,
                },
            };
        }
        return node;
    });
}
