import { create } from "zustand";

import type { CanvasAgentOp, CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import type { CanvasGenerationMode, CanvasNodeData } from "@/types/canvas";

/** 画布暴露给 DeepSeek Harness 的上下文：快照、选中态与套用画布操作的能力。 */
export type CanvasAssistantContext = {
    snapshot: CanvasAgentSnapshot;
    getSnapshot: () => CanvasAgentSnapshot;
    getCreationCenter?: () => { x: number; y: number };
    applyOps: (ops: CanvasAgentOp[]) => CanvasAgentSnapshot;
    undoOps?: () => CanvasAgentSnapshot | null;
    canUndo?: boolean;
    runNode: (nodeId: string, mode?: CanvasGenerationMode, prompt?: string, signal?: AbortSignal) => Promise<CanvasNodeData | undefined>;
};

/** 悬浮面板开合与画布上下文。除 DeepSeek Harness 外不再有其它助手实现。 */
export const useCanvasAssistantStore = create<{
    open: boolean;
    context: CanvasAssistantContext | null;
    setOpen: (open: boolean) => void;
    setContext: (context: CanvasAssistantContext | null) => void;
}>((set) => ({
    open: false,
    context: null,
    setOpen: (open) => set({ open }),
    setContext: (context) => set({ context }),
}));
