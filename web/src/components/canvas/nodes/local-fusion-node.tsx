import { useEffect, useRef, useState } from "react";
import { Blend, Image as ImageIcon } from "lucide-react";
import { stopWorkflowControlDrag } from "@/components/canvas/workflow-node-interactions";
import { runLocalFusionNode } from "@/lib/canvas/canvas-local-fusion-run";
import { FUSION_PATCH_PORT, LOCAL_FUSION_NODE_TYPE, fusionInputs, resolveFusionCropContext } from "@/lib/canvas/canvas-local-fusion";
import type { CanvasNodeContext, CanvasNodeDefinition } from "@/types/canvas-plugin";

export function LocalFusionContent({ ctx }: { ctx: CanvasNodeContext }) {
    const { node, theme } = ctx, current = useRef(ctx), alive = useRef(true), runningRef = useRef(false);
    current.current = ctx;
    const [running, setRunning] = useState(false), [error, setError] = useState("");
    const [graph, setGraph] = useState(() => ({ nodes: ctx.getNodes(), connections: ctx.getConnections() }));
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        const refresh = () => setGraph((previous) => {
            const nodes = current.current.getNodes(), connections = current.current.getConnections();
            return previous.nodes === nodes && previous.connections === connections ? previous : { nodes, connections };
        });
        refresh();
        return ctx.on?.("canvas:graph-changed", refresh);
    }, [ctx]);
    const nodes = graph.nodes, connections = graph.connections, inputs = fusionInputs(node.id, nodes, connections);
    const original = inputs.originals[0], invalid = inputs.patches.find((patch) => resolveFusionCropContext(patch.id, original, nodes, connections).kind !== "local");
    const ready = inputs.originals.length === 1 && inputs.patches.length > 0 && !invalid;
    const reason = inputs.originals.length > 1 ? "原图端口只能连接一张完整图片" : !original ? "完整原图连接左侧，局部修改图连接右上方补丁端口" : !inputs.patches.length ? "请将局部修改图连接到右上方补丁端口" : invalid ? `“${invalid.title}”${resolveFusionCropContext(invalid.id, original, nodes, connections).kind === "conflict" ? "有多个回贴位置，请保留目标局部图的选区来源" : "没有选区来源，请使用提取选区的修改结果"}` : `${inputs.patches.length} 张局部修改图 · 本地合成，不调用 API`;
    const colorMatch = node.metadata?.fusionColorMatch !== false;
    const softBorder = theme.glass.insetBorder;
    const run = async () => {
        if (runningRef.current) return;
        const projectId = current.current.getProjectId?.();
        runningRef.current = true; setRunning(true); setError("");
        try {
            await runLocalFusionNode(node.id,
                () => ({ projectId: current.current.getProjectId?.(), nodes: current.current.getNodes(), connections: current.current.getConnections() }),
                (ops) => current.current.applyOps(ops),
                { isCurrent: () => alive.current && current.current.getProjectId?.() === projectId });
        } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { runningRef.current = false; if (alive.current) setRunning(false); }
    };
    const pane = (label: string, dotColor: string, url?: string) => (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border transition-colors" style={{ borderColor: url ? softBorder : theme.node.stroke, borderStyle: url ? "solid" : "dashed", background: theme.glass.inset }}>
            <div className="flex shrink-0 items-center gap-1.5 px-2 py-1 text-[10px] font-medium" style={{ color: theme.node.muted }}>
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: dotColor }} />
                <span className="truncate">{label}</span>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-1 pt-0">
                {url ? <img src={url} alt={label} draggable={false} className="h-full w-full rounded-lg object-contain" /> : <ImageIcon className="size-6 opacity-35" style={{ color: theme.node.muted }} />}
            </div>
        </div>
    );
    return (
        <div data-fusion-node className="relative flex h-full w-full flex-col overflow-hidden text-xs" style={{ background: theme.node.panel, color: theme.node.text }} onMouseDown={stopWorkflowControlDrag}>
            <div className="h-[2px] w-full shrink-0" style={{ background: ready || running ? theme.accent.base : softBorder }} />
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2" style={{ borderColor: softBorder, background: theme.glass.inset }}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: theme.accent.soft, color: theme.accent.base }}><Blend className="size-4" /></span>
                <div className="min-w-0 flex-1 cursor-grab" data-node-drag-handle>
                    <div className="truncate text-xs font-semibold">局部融合</div>
                    <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>本地合成 · 不消耗额度</div>
                </div>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: ready || running ? theme.accent.soft : theme.glass.inset, color: ready || running ? theme.accent.base : theme.node.muted }}>
                    {running ? "融合中" : ready ? `就绪 · ${inputs.patches.length} 补丁` : "待连线"}
                </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
                <div className="flex min-h-[112px] flex-1 gap-2">
                    {pane("左侧 · 原图", theme.accent.base, original?.metadata?.content)}
                    <div data-fusion-patches className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
                        {inputs.patches.length ? inputs.patches.map((patch, index) => <div className="flex min-h-0 flex-1" key={`${patch.id}-${index}`}>{pane(`右上 · 局部修改 ${index + 1}`, "#38bdf8", patch.metadata?.content)}</div>) : pane("右上 · 局部修改", "#38bdf8")}
                    </div>
                </div>
                {(!ready || invalid) && <p className="m-0 rounded-lg px-2 py-1 text-[11px] leading-snug" style={{ background: theme.glass.inset, color: theme.node.muted }}>{reason}</p>}
                {error && <p role="alert" className="m-0 break-words rounded-lg bg-red-500/10 px-2 py-1 text-[11px] text-red-500">{error}</p>}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2" style={{ borderColor: softBorder, background: theme.glass.inset }}>
                <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs">
                    <input type="checkbox" className="sr-only" disabled={running} checked={colorMatch} onChange={(event) => ctx.updateMetadata({ fusionColorMatch: event.target.checked })} />
                    <span className="flex h-4 w-7 items-center rounded-full p-0.5 transition-colors" style={{ background: colorMatch ? theme.accent.base : theme.node.stroke }}>
                        <span className={`size-3 rounded-full bg-white shadow-xs transition-transform ${colorMatch ? "translate-x-3" : "translate-x-0"}`} />
                    </span>
                    <span style={{ color: theme.node.text }}>颜色匹配</span>
                </label>
                <button type="button" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40" style={{ backgroundImage: "linear-gradient(135deg, #0ea977, #12896a)" }} disabled={!ready || running} onClick={() => void run()}>{running ? "正在融合…" : "开始融合"}</button>
            </div>
        </div>
    );
}

export const localFusionNodeDefinition: CanvasNodeDefinition = {
    type: LOCAL_FUSION_NODE_TYPE, title: "融合节点", icon: <Blend className="size-4" />,
    defaultSize: { width: 310, height: 320 }, defaultMetadata: { fusionColorMatch: true },
    hidePanel: true, hasSourceHandle: true, Content: LocalFusionContent,
    resource: (node) => node.metadata?.content ? { kind: "image", url: node.metadata.content } : null,
};

export { FUSION_PATCH_PORT };
