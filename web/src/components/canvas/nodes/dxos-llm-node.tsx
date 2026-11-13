import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "antd";
import { BrainCircuit, FileText, Play, Square } from "lucide-react";
import { ModelPicker } from "@/components/model-picker";
import { decodeChannelModel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { collectLlmInputs, LLM_TYPE } from "@/lib/canvas/dxos-llm";
import { isWorkflowNodeRunning, runWorkflowNode, stopWorkflowNode } from "@/lib/canvas/canvas-workflow-runner";
import type { CanvasNodeContext, CanvasNodeDefinition } from "@/types/canvas-plugin";
import { stopWorkflowControlDrag } from "@/components/canvas/workflow-node-interactions";
import { workflowDisplayMetadata } from "@/lib/canvas/workflow-display-size";
import { LLM_NODE_DEFAULT_SIZE } from "@/lib/canvas/canvas-node-size";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";

const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

function readLlmInputs(ctx: CanvasNodeContext) {
    const nodes = ctx.getNodes(), connections = ctx.getConnections(), snapshot = { node: ctx.node, nodes, connections };
    try { return { ...snapshot, inputs: collectLlmInputs(ctx.node, nodes, connections, true), error: "" }; }
    catch (reason) { return { ...snapshot, inputs: null, error: reason instanceof Error ? reason.message : String(reason) }; }
}

export function LlmContent({ ctx }: { ctx: CanvasNodeContext }) {
    const { node, theme } = ctx, meta = node.metadata || {}, config = useEffectiveConfig();
    const current = useRef(ctx); current.current = ctx;
    const [incoming, setIncoming] = useState(() => readLlmInputs(ctx));
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    // Subscribe independently of CanvasNode memoization, after host graph refs are committed.
    useEffect(() => {
        const refresh = () => setIncoming((previous) => {
            const latest = current.current;
            return previous.node === latest.node && previous.nodes === latest.getNodes() && previous.connections === latest.getConnections() ? previous : readLlmInputs(latest);
        });
        const unsubscribe = ctx.on("canvas:graph-changed", refresh);
        refresh();
        return unsubscribe;
    }, [ctx]);
    const controller = useRef<AbortController | null>(null), mounted = useRef(true);
    const [localRunning, setRunning] = useState(false), [error, setError] = useState("");
    const running = localRunning || (meta.status === "loading" && isWorkflowNodeRunning(node.id));
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, [node.id]);
    const mode = meta.llmOutputMode === "list" ? "list" : "text";
    const model = meta.model ?? ctx.ai.defaultModel("text");
    const summary = incoming.error || (incoming.inputs ? incoming.inputs.references.length + " 张图片 · " + (incoming.inputs.text ? "含文本输入" : "无文本输入") : "连接图片、图片组或文本到左侧输入");
    const images = incoming.inputs?.previews?.filter((item) => item.type === "image") || [], textInputs = incoming.inputs?.previews?.filter((item) => item.type === "text") || [];

    const run = async () => {
        if (controller.current || isWorkflowNodeRunning(node.id)) return;
        const abort = new AbortController(); controller.current = abort; setRunning(true); setError("");
        try {
            await runWorkflowNode(node.id, { getNode: (id) => current.current.getNode(id), getNodes: () => current.current.getNodes(), getConnections: () => current.current.getConnections(), applyOps: (ops) => current.current.applyOps(ops), ai: current.current.ai, getConfig: () => config, isActive: () => mounted.current }, { signal: abort.signal });
        } catch (reason) { if (mounted.current && controller.current === abort && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { if (controller.current === abort) { controller.current = null; if (mounted.current) setRunning(false); } }
    };
    const cancel = () => { controller.current?.abort(); stopWorkflowNode(node.id); controller.current = null; setRunning(false); if (current.current.getNode(node.id)) current.current.updateMetadata({ status: "idle", errorDetails: undefined }); };
    return <div data-llm-chat className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl text-2xl" style={{ background: theme.node.panel, color: theme.node.text }} onMouseDown={stopWorkflowControlDrag} onPointerDown={stop} onKeyDown={stop}>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6">
            {!!incoming.inputs?.previews?.length && <div data-node-scroll data-node-no-drag aria-label="LLM 输入素材" className="max-h-44 shrink-0 overflow-auto overscroll-contain">
                {!!images.length && <div className="flex flex-wrap gap-3">{images.map((item, index) => <div key={item.id} className="w-20 min-w-0" title={item.title}>
                    <img src={previewUrlFor(item.storageKey) || item.content} alt={item.title} className="h-20 w-full rounded-xl border object-contain" style={{ borderColor: theme.node.stroke }} decoding="async" draggable={false} />
                    <span className="mt-1 block truncate text-2xl" style={{ color: theme.node.muted }}>{index + 1}. {item.title}</span>
                </div>)}</div>}
                {textInputs.map((item) => <div key={item.id} className="mt-3 min-w-0 select-text">
                    <div className="inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1" style={{ background: theme.toolbar.activeBg }}><FileText className="size-5 shrink-0" /><span className="truncate" title={item.title}>{item.title}</span></div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-2xl" style={{ color: theme.node.muted }}>{item.content || "文本节点暂无内容"}</p>
                </div>)}
            </div>}
            <textarea aria-label="LLM 提示词" disabled={running} className="min-h-28 w-full flex-1 resize-none overscroll-contain border-0 bg-transparent leading-relaxed outline-none" style={{ color: theme.node.text, fontSize: "inherit" }} placeholder="例如：分析已连接图片；输入你的分析要求…" value={meta.prompt || ""} onChange={(event) => ctx.updateMetadata({ prompt: event.target.value })} />
            {(meta.content || running) && <div data-node-scroll data-node-no-drag aria-label="LLM 分析结果" className="max-h-48 shrink-0 select-text overflow-auto overscroll-contain border-t pt-3 whitespace-pre-wrap break-words" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{running ? "正在分析…" : meta.content}</div>}
            {incoming.error && <p role="alert" className="break-words" style={{ color: theme.node.muted }}>{summary}</p>}
        </div>
        <div className="shrink-0 space-y-3 border-t p-5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <fieldset aria-label="LLM 输出模式" disabled={running} className="inline-flex min-w-0 gap-1 rounded-full border p-1" style={{ borderColor: theme.node.stroke }}>{([['text', '文本'], ['list', '多维表格']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} className="rounded-full px-4 py-0.5 disabled:opacity-50" style={mode === value ? { background: theme.canvas.selectionStroke, color: theme.node.panel } : { color: theme.node.muted }} onClick={() => ctx.updateMetadata({ llmOutputMode: value })}>{label}</button>)}</fieldset>
            <div className="flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><ModelPicker config={config} value={model} capability="text" groupByChannel="list" fullWidth disabled={running} ariaLabel="LLM 模型" className="!h-14 !text-2xl" placeholder="选择分析模型" onMissingConfig={() => useConfigStore.getState().openConfigDialog(true)} onChange={(value) => ctx.updateMetadata({ model: value, llmChannelId: decodeChannelModel(value)?.channelId || "" })} /></div><Button type="primary" shape="circle" aria-label={running ? "停止分析" : "开始分析"} danger={running} style={{ width: 56, height: 56, flexShrink: 0 }} icon={running ? <Square size={24} /> : <Play size={26} />} onClick={() => running ? cancel() : void run()} /></div>
            {(error || meta.errorDetails) && <p role="alert" className="break-words">{error || meta.errorDetails}</p>}
            {(running || meta.status === "success" || meta.status === "loading") && <p role="status" className="text-2xl" style={{ color: theme.node.muted }}>{running ? "运行中" : meta.status === "loading" ? "上次运行已中断" : "已完成"}</p>}
        </div>
    </div>;
}

export const llmNodeDefinition: CanvasNodeDefinition = {
    type: LLM_TYPE, title: "LLM 多模态分析", icon: <BrainCircuit className="size-4" />,
    defaultSize: LLM_NODE_DEFAULT_SIZE, defaultMetadata: { ...workflowDisplayMetadata, llmOutputMode: "text" },
    hidePanel: true, hasSourceHandle: true, Content: LlmContent,
};
