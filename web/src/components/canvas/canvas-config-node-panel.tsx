import { useState } from "react";
import { Maximize2, Play, Square } from "lucide-react";
import { Button, Modal } from "antd";
import { ModelPicker } from "@/components/model-picker";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";
import { useThemeStore } from "@/stores/use-theme-store";
import { stopWorkflowControlDrag } from "./workflow-node-interactions";
import { CanvasConfigComposer } from "./canvas-config-composer";
import type { NodeGenerationInput } from "./canvas-node-generation";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

type Props = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    inputs: NodeGenerationInput[];
    connectedNodes: CanvasNodeData[];
    isRunning: boolean;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onStop: (nodeId: string) => void;
    onDisconnectReference: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection: (nodeId: string) => void;
};

export function CanvasConfigNodePanel({ node, nodes, inputs, connectedNodes, isRunning, onConfigChange, onGenerate, onStop, onDisconnectReference, onStartReferenceSelection }: Props) {
    const global = useEffectiveConfig(), theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [expanded, setExpanded] = useState(false);
    const meta = node.metadata || {}, value = meta.composerContent ?? meta.prompt ?? "";
    const config = { ...global, model: resolveModelForCapability(global, meta.model, "image"), size: meta.size || global.size, quality: meta.quality || global.quality, count: String(meta.count || global.canvasImageCount || global.count) };
    const compressionEnabled = meta.imageCompressionEnabled === true, compressionResolution = meta.imageCompressionResolution ?? "2k", compressionMaxMb = meta.imageCompressionMaxMb ?? 1;
    const ratio = meta.imageAspectRatio || inferMediaRatio(config.size), resolution = meta.imageResolution || inferMediaScale(config.size);
    const patch = (next: Partial<CanvasNodeMetadata>) => onConfigChange(node.id, next);
    const inputStyle = { background: theme.node.panel, color: theme.node.text, border: `1px solid ${theme.node.stroke}`, borderRadius: 12 };
    const editor = (large: boolean) => <CanvasConfigComposer nodeId={node.id} nodes={nodes} inputs={inputs} connectedNodes={connectedNodes} value={value} embedded expanded={large} onChange={(composerContent) => patch({ composerContent })} onClose={() => setExpanded(false)} onDisconnectReference={onDisconnectReference} onStartReferenceSelection={(nodeId) => { setExpanded(false); onStartReferenceSelection(nodeId); }} onReorderReferences={isRunning ? undefined : (referenceNodeOrder) => patch({ referenceNodeOrder })} />;
    return <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl text-sm" style={{ background: theme.node.panel, color: theme.node.text }}>
        <div data-canvas-no-zoom className="flex min-h-0 flex-1 flex-col p-4" onMouseDown={stopWorkflowControlDrag}>
            <div className="mb-2 flex shrink-0 justify-end"><button type="button" aria-label="放大编辑生成配置" className="inline-flex items-center gap-1 text-xs opacity-70 hover:opacity-100" onClick={() => setExpanded(true)}><Maximize2 size={14} />放大编辑</button></div>
            {!expanded ? editor(false) : <p className="opacity-60">正在放大编辑 · 内容实时同步</p>}
        </div>
        <div data-canvas-no-zoom className="shrink-0 space-y-2 border-t p-4" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onMouseDown={stopWorkflowControlDrag}>
            <span className="inline-block rounded-full px-3 py-0.5 text-xs" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>探索</span>
            <div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><ModelPicker className="h-10" config={config} value={config.model} onChange={(model) => patch({ model })} capability="image" onMissingConfig={() => useConfigStore.getState().openConfigDialog(true)} fullWidth /></div><Button type="primary" shape="circle" aria-label={isRunning ? "停止生成" : "生成图片"} disabled={!isRunning && !value.trim() && !inputs.length} danger={isRunning} icon={isRunning ? <Square size={16} /> : <Play size={18} />} onClick={() => isRunning ? onStop(node.id) : onGenerate(node.id)} /></div>
            <div className="grid grid-cols-4 gap-2 text-xs">
                <label className="min-w-0 rounded-xl p-2" style={inputStyle}>比例<select aria-label="生成配置比例" className="mt-1 w-full bg-transparent outline-none" disabled={isRunning} value={ratio} onChange={(event) => patch({ imageAspectRatio: event.target.value, imageResolution: resolution, size: computeMediaSize(resolution, event.target.value) })}>{mediaRatioOptions.map((item) => <option key={item.value} value={item.value}>{item.value === "auto" ? "自动" : item.value}</option>)}</select></label>
                <label className="min-w-0 rounded-xl p-2" style={inputStyle}>清晰度<select aria-label="生成配置分辨率" className="mt-1 w-full bg-transparent outline-none" disabled={isRunning} value={resolution} onChange={(event) => patch({ imageResolution: event.target.value, imageAspectRatio: ratio, size: computeMediaSize(event.target.value, ratio) })}>{mediaScaleOptions.map((item) => <option key={item} value={item}>{item === "auto" ? "自动" : item.toUpperCase()}</option>)}</select></label>
                <label className="min-w-0 rounded-xl p-2" style={inputStyle}>质量<select aria-label="生成配置质量" className="mt-1 w-full bg-transparent outline-none" disabled={isRunning} value={config.quality} onChange={(event) => patch({ quality: event.target.value })}>{["auto", "low", "medium", "high", "xhigh", "max"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="min-w-0 rounded-xl p-2" style={inputStyle}>数量<input aria-label="生成配置数量" className="mt-1 w-full bg-transparent outline-none" type="number" min={1} max={15} disabled={isRunning} value={config.count} onChange={(event) => patch({ count: Math.max(1, Math.min(15, Number(event.target.value) || 1)) })} /></label>
            </div>
            <div data-image-compression className="space-y-2 border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center justify-between gap-2"><span className="font-medium">图片压缩</span><div className="flex items-center gap-2"><span className="text-xs opacity-60">{compressionEnabled ? `${compressionResolution.toUpperCase()} · ${compressionMaxMb} MB` : "未启用"}</span><button type="button" role="switch" aria-label="图片压缩" aria-checked={compressionEnabled} disabled={isRunning} className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: compressionEnabled ? theme.toolbar.activeText : theme.node.stroke }} onClick={() => patch({ imageCompressionEnabled: !compressionEnabled })}><span aria-hidden="true" className="absolute left-0.5 top-0.5 size-5 rounded-full shadow-sm transition-transform" style={{ background: theme.node.panel, transform: compressionEnabled ? "translateX(20px)" : "translateX(0)" }} /></button></div></div>
                <div className="flex items-center gap-2 text-xs"><span>最长边</span><select aria-label="压缩最长边" disabled={!compressionEnabled || isRunning} value={compressionResolution} className="rounded-lg px-2 py-1 disabled:opacity-50" style={inputStyle} onChange={(event) => patch({ imageCompressionResolution: event.target.value as "1k" | "2k" | "4k" })}>{["1k", "2k", "4k"].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select><label className="ml-auto flex min-w-0 items-center gap-2">单图上限<input aria-label="压缩单图上限 MB" type="number" step="any" disabled={!compressionEnabled || isRunning} value={compressionMaxMb} className="w-20 rounded-lg px-2 py-1 disabled:opacity-50" style={inputStyle} onChange={(event) => patch({ imageCompressionMaxMb: event.target.value === "" ? 0 : Number(event.target.value) })} />MB</label></div>
                <p className="text-[11px] opacity-60">仅压缩发送的参考图，保留画布原图</p>
            </div>
        </div>
        <Modal title="生成配置 · 放大编辑" open={expanded} footer={null} centered width="min(1000px, 94vw)" onCancel={() => setExpanded(false)} destroyOnHidden styles={{ container: { background: theme.node.panel, color: theme.node.text } }} modalRender={(modal) => <div data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{modal}</div>}><div className="flex h-[65vh] min-h-0 flex-col">{expanded && editor(true)}</div></Modal>
    </div>;
}