import { CONFIG_NODE_DEFAULT_SIZE, IMAGE_NODE_MAX_EDGE, LLM_NODE_DEFAULT_SIZE, TEXT_NODE_DEFAULT_SIZE } from "./canvas-node-size";
import { LOCAL_FUSION_NODE_TYPE } from "./canvas-fusion-ports";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export const workflowDisplayMetadata = { workflowDisplayVersion: 1 };
export const isEnlargedWorkflowType = (type: string) => ["dxos:table", "dxos:llm", "dxos:concurrent"].includes(type);

/** Enlarge saved nodes once; newly created nodes already use the enlarged defaults. */
export function enlargeWorkflowNodes(nodes: CanvasNodeData[]): CanvasNodeData[] {
    let changed = false;
    const result = nodes.map((node) => {
        const llmDefault = node.type === "dxos:llm" && ((node.width === 430 && node.height === 540) || (node.width === 645 && node.height === 810));
        if (llmDefault) { changed = true; return { ...node, ...LLM_NODE_DEFAULT_SIZE, metadata: { ...node.metadata, ...workflowDisplayMetadata } }; }
        // 融合节点旧默认 460×380 在画布上太小，一次性放大到与生成节点一致。
        if (node.type === LOCAL_FUSION_NODE_TYPE && node.width === 460 && node.height === 380) { changed = true; return { ...node, width: IMAGE_NODE_MAX_EDGE, height: IMAGE_NODE_MAX_EDGE }; }
        const defaultSize = node.type === "config" && node.width === 540 && node.height === 440 ? CONFIG_NODE_DEFAULT_SIZE : node.type === "text" && [320, 340].includes(node.width) && node.height === 240 ? TEXT_NODE_DEFAULT_SIZE : null;
        if (defaultSize) { changed = true; return { ...node, ...defaultSize }; }
        const metadata = node.metadata as (CanvasNodeMetadata & { workflowDisplayVersion?: number }) | undefined;
        if (!isEnlargedWorkflowType(node.type) || metadata?.workflowDisplayVersion === 1) return node;
        changed = true;
        return { ...node, width: node.width * 1.5, height: node.height * 1.5, metadata: { ...metadata, ...workflowDisplayMetadata } };
    });
    return changed ? result : nodes;
}
