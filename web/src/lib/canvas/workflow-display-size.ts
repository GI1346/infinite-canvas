import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export const workflowDisplayMetadata = { workflowDisplayVersion: 1 };
export const isEnlargedWorkflowType = (type: string) => ["dxos:table", "dxos:llm", "dxos:concurrent"].includes(type);

/** Enlarge saved nodes once; newly created nodes already use the enlarged defaults. */
export function enlargeWorkflowNodes(nodes: CanvasNodeData[]): CanvasNodeData[] {
    let changed = false;
    const result = nodes.map((node) => {
        const metadata = node.metadata as (CanvasNodeMetadata & { workflowDisplayVersion?: number }) | undefined;
        if (!isEnlargedWorkflowType(node.type) || metadata?.workflowDisplayVersion === 1) return node;
        changed = true;
        return { ...node, width: node.width * 1.5, height: node.height * 1.5, metadata: { ...metadata, ...workflowDisplayMetadata } };
    });
    return changed ? result : nodes;
}
