import { CONFIG_NODE_DEFAULT_SIZE, TEXT_NODE_DEFAULT_SIZE } from "./canvas-node-size";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export const workflowDisplayMetadata = { workflowDisplayVersion: 1 };
export const isEnlargedWorkflowType = (type: string) => ["dxos:table", "dxos:llm", "dxos:concurrent"].includes(type);

/** Enlarge saved nodes once; newly created nodes already use the enlarged defaults. */
export function enlargeWorkflowNodes(nodes: CanvasNodeData[]): CanvasNodeData[] {
    let changed = false;
    const result = nodes.map((node) => {
        const defaultSize = node.type === "config" && node.width === 540 && node.height === 440 ? CONFIG_NODE_DEFAULT_SIZE : node.type === "text" && [320, 340].includes(node.width) && node.height === 240 ? TEXT_NODE_DEFAULT_SIZE : null;
        if (defaultSize) { changed = true; return { ...node, ...defaultSize }; }
        const metadata = node.metadata as (CanvasNodeMetadata & { workflowDisplayVersion?: number }) | undefined;
        if (!isEnlargedWorkflowType(node.type) || metadata?.workflowDisplayVersion === 1) return node;
        changed = true;
        return { ...node, width: node.width * 1.5, height: node.height * 1.5, metadata: { ...metadata, ...workflowDisplayMetadata } };
    });
    return changed ? result : nodes;
}
