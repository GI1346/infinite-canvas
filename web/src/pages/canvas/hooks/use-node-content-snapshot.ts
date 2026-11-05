import { useMemo, useRef } from "react";
import type { CanvasNodeData } from "@/types/canvas";

// Inputs and references do not change when only the position of a node changes.
export function useNodeContentSnapshot(nodes: CanvasNodeData[], isNodeDragging: boolean) {
    const previous = useRef(nodes);
    return useMemo(() => {
        if (!isNodeDragging || previous.current.length !== nodes.length || nodes.some((node, index) => {
            const old = previous.current[index];
            if (node === old) return false;
            return node.id !== old.id || node.type !== old.type || node.title !== old.title || node.width !== old.width || node.height !== old.height || node.metadata !== old.metadata;
        })) previous.current = nodes;
        return previous.current;
    }, [nodes, isNodeDragging]);
}