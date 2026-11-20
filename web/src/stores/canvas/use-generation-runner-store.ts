import { create } from "zustand";

export type RunningGenerationTask = {
    nodeId: string;
    projectId: string;
    startedAt: number;
    controller: AbortController;
    targetNodeId?: string;
    outputNodeIds?: string[];
    originNodeId?: string;
    stage?: 0 | 1 | 2;
};

type GenerationRunnerState = {
    tasks: Record<string, RunningGenerationTask>;
    registerTask: (task: RunningGenerationTask) => void;
    updateTask: (task: RunningGenerationTask, patch: Pick<RunningGenerationTask, "targetNodeId" | "stage" | "outputNodeIds">) => void;
    finishTask: (task: RunningGenerationTask) => void;
    abortTask: (task: RunningGenerationTask) => void;
    abortProjectTasks: (projectId: string) => void;
    isNodeRunning: (projectId: string, nodeId: string) => boolean;
};

// Imported projects can share node IDs. Only the owning controller can finish or update a task.
export const generationTaskKey = (projectId: string, nodeId: string) => JSON.stringify([projectId, nodeId]);
const keyOf = ({ projectId, nodeId }: RunningGenerationTask) => generationTaskKey(projectId, nodeId);

export const useGenerationRunnerStore = create<GenerationRunnerState>((set, get) => ({
    tasks: {},
    registerTask: (task) => {
        const key = keyOf(task), previous = get().tasks[key];
        set((state) => ({ tasks: { ...state.tasks, [key]: task } }));
        if (previous && previous.controller !== task.controller) previous.controller.abort();
    },
    updateTask: (task, patch) => set((state) => {
        const key = keyOf(task), current = state.tasks[key];
        return current?.controller === task.controller ? { tasks: { ...state.tasks, [key]: { ...current, ...patch } } } : state;
    }),
    finishTask: (task) => set((state) => {
        const key = keyOf(task);
        if (state.tasks[key]?.controller !== task.controller) return state;
        const tasks = { ...state.tasks };
        delete tasks[key];
        return { tasks };
    }),
    abortTask: (task) => {
        if (get().tasks[keyOf(task)]?.controller !== task.controller) return;
        get().finishTask(task);
        task.controller.abort();
    },
    abortProjectTasks: (projectId) => {
        for (const task of Object.values(get().tasks)) if (task.projectId === projectId) get().abortTask(task);
    },
    isNodeRunning: (projectId, nodeId) => Object.values(get().tasks).some((task) => task.projectId === projectId && (task.nodeId === nodeId || task.targetNodeId === nodeId || task.outputNodeIds?.includes(nodeId))),
}));

export function startCanvasImageTask(projectId: string, nodeId: string, startedAt: number, originNodeId = nodeId): RunningGenerationTask {
    const task = { projectId, nodeId, startedAt, controller: new AbortController(), originNodeId };
    useGenerationRunnerStore.getState().registerTask(task);
    return task;
}

export const ownsCanvasImageTask = (task: RunningGenerationTask) => useGenerationRunnerStore.getState().tasks[keyOf(task)]?.controller === task.controller;
