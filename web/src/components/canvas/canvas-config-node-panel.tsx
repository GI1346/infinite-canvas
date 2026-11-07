import { imageQualityForModel, imageQualityOptions } from "@/lib/image-quality";
import { useState, type ReactNode } from "react";
import { ChevronDown, Maximize2, Play, Square } from "lucide-react";
import { Popover } from "radix-ui";
import { Button, Modal } from "antd";
import { ModelPicker, useCanvasMenuZoom } from "@/components/model-picker";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";
import { useThemeStore } from "@/stores/use-theme-store";
import { stopWorkflowControlDrag } from "./workflow-node-interactions";
import { CanvasConfigComposer } from "./canvas-config-composer";
import type { NodeGenerationInput } from "./canvas-node-generation";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { GalleryImage } from "@/pages/gallery/gallery-data";

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
    onAddImageReference: (nodeId: string, image: GalleryImage) => Promise<NodeGenerationInput>;
};

export function CanvasConfigNodePanel({ node, nodes, inputs, connectedNodes, isRunning, onConfigChange, onGenerate, onStop, onDisconnectReference, onStartReferenceSelection, onAddImageReference }: Props) {
    const global = useEffectiveConfig(), theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [expanded, setExpanded] = useState(false);
    const meta = node.metadata || {}, value = meta.composerContent ?? meta.prompt ?? "";
    const config = { ...global, model: resolveModelForCapability(global, meta.model, "image"), size: meta.size || global.size, quality: meta.quality || global.quality, count: String(meta.count || global.canvasImageCount || global.count) };
    const qualityOptions = imageQualityOptions(config.model), quality = imageQualityForModel(config.model, config.quality);
    const compressionEnabled = meta.imageCompressionEnabled === true, compressionResolution = meta.imageCompressionResolution ?? "2k", compressionMaxMb = meta.imageCompressionMaxMb ?? 1;
    const ratio = meta.imageAspectRatio || inferMediaRatio(config.size), resolution = meta.imageResolution || inferMediaScale(config.size);
    const patch = (next: Partial<CanvasNodeMetadata>) => onConfigChange(node.id, next);
    const inputStyle = { background: theme.node.panel, color: theme.node.text, border: `1px solid ${theme.node.stroke}`, borderRadius: 12 };
    const editor = (large: boolean) => <CanvasConfigComposer nodeId={node.id} nodes={nodes} inputs={inputs} connectedNodes={connectedNodes} value={value} embedded expanded={large} fontSize={24} onChange={(composerContent) => patch({ composerContent })} onClose={() => setExpanded(false)} onDisconnectReference={onDisconnectReference} onAddImageReference={onAddImageReference} onStartReferenceSelection={(nodeId) => { setExpanded(false); onStartReferenceSelection(nodeId); }} onReorderReferences={isRunning ? undefined : (referenceNodeOrder) => patch({ referenceNodeOrder })} />;
    return <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl text-2xl" style={{ background: theme.node.panel, color: theme.node.text }}>
        <div data-canvas-no-zoom className="flex min-h-0 flex-1 flex-col p-4" onMouseDown={stopWorkflowControlDrag}>
            <div className="mb-2 flex shrink-0 justify-end"><button type="button" aria-label="放大编辑生成配置" className="inline-flex items-center gap-2 text-2xl opacity-70 hover:opacity-100" onClick={() => setExpanded(true)}><Maximize2 size={24} />放大编辑</button></div>
            {!expanded ? editor(false) : <p className="opacity-60">正在放大编辑 · 内容实时同步</p>}
        </div>
        <div data-canvas-no-zoom className="shrink-0 space-y-2 border-t p-4" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onMouseDown={stopWorkflowControlDrag}>
            <span className="inline-block rounded-full px-3 py-0.5" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>探索</span>
            <div className="flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><ModelPicker className="!h-14 !text-2xl" config={config} value={config.model} onChange={(model) => patch({ model, quality: imageQualityForModel(model, config.quality) })} capability="image" groupByChannel="list" onMissingConfig={() => useConfigStore.getState().openConfigDialog(true)} fullWidth /></div><Button type="primary" shape="circle" aria-label={isRunning ? "停止生成" : "生成图片"} disabled={!isRunning && !value.trim() && !inputs.length} danger={isRunning} style={{ width: 56, height: 56 }} icon={isRunning ? <Square size={24} /> : <Play size={26} />} onClick={() => isRunning ? onStop(node.id) : onGenerate(node.id)} /></div>
            <div className="grid grid-cols-4 gap-3">
                <ParameterMenu label="比例" ariaLabel="生成配置比例" value={ratio === "auto" ? "自动" : ratio} disabled={isRunning} wide>{(close) => <ParameterOptions columns={4} value={ratio} options={mediaRatioOptions.map((item) => ({ value: item.value, label: item.value === "auto" ? "自动" : item.value, icon: item.value === "auto" ? <span className="text-sm font-bold">A</span> : <span className="inline-block rounded-[2px] border" style={{ width: Math.min(12, 10 * item.width / item.height), height: Math.min(12, 10 * item.height / item.width) }} /> }))} onChange={(next) => { patch({ imageAspectRatio: next, imageResolution: resolution, size: computeMediaSize(resolution, next) }); close(); }} />}</ParameterMenu>
                <ParameterMenu label="清晰度" ariaLabel="生成配置分辨率" value={resolution === "auto" ? "自动" : resolution.toUpperCase()} disabled={isRunning}>{(close) => <ParameterOptions value={resolution} options={mediaScaleOptions.map((item) => ({ value: item, label: item === "auto" ? "自动" : item.toUpperCase() }))} onChange={(next) => { patch({ imageResolution: next, imageAspectRatio: ratio, size: computeMediaSize(next, ratio) }); close(); }} />}</ParameterMenu>
                <ParameterMenu label="质量" ariaLabel="生成配置质量" value={quality} disabled={isRunning || !qualityOptions.length}>{(close) => <ParameterOptions columns={qualityOptions.length > 4 ? 3 : 2} value={quality} options={qualityOptions.map((item) => ({ value: item, label: item }))} onChange={(next) => { patch({ quality: next }); close(); }} />}</ParameterMenu>
                <CountParameter value={Number(config.count)} disabled={isRunning} onChange={(count) => patch({ count })} />
            </div>
            <div data-image-compression className="space-y-2 border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center justify-between gap-2"><span className="font-medium">图片压缩</span><div className="flex items-center gap-2"><span className="opacity-60">{compressionEnabled ? `${compressionResolution.toUpperCase()} · ${compressionMaxMb} MB` : "未启用"}</span><button type="button" role="switch" aria-label="图片压缩" aria-checked={compressionEnabled} disabled={isRunning} className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: compressionEnabled ? theme.toolbar.activeText : theme.node.stroke }} onClick={() => patch({ imageCompressionEnabled: !compressionEnabled })}><span aria-hidden="true" className="absolute left-0.5 top-0.5 size-5 rounded-full shadow-sm transition-transform" style={{ background: theme.node.panel, transform: compressionEnabled ? "translateX(20px)" : "translateX(0)" }} /></button></div></div>
                <div className="flex flex-wrap items-center gap-3"><span>最长边</span><select aria-label="压缩最长边" disabled={!compressionEnabled || isRunning} value={compressionResolution} className="rounded-lg px-2 py-1 disabled:opacity-50" style={inputStyle} onChange={(event) => patch({ imageCompressionResolution: event.target.value as "1k" | "2k" | "4k" })}>{["1k", "2k", "4k"].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select><label className="ml-auto flex min-w-0 items-center gap-2">单图上限<input aria-label="压缩单图上限 MB" type="number" step="any" disabled={!compressionEnabled || isRunning} value={compressionMaxMb} className="w-20 rounded-lg px-2 py-1 disabled:opacity-50" style={inputStyle} onChange={(event) => patch({ imageCompressionMaxMb: event.target.value === "" ? 0 : Number(event.target.value) })} />MB</label></div>
                <p className="opacity-60">仅压缩发送的参考图，保留画布原图</p>
            </div>
        </div>
        <Modal title="生成配置 · 放大编辑" open={expanded} footer={null} centered width="min(1000px, 94vw)" onCancel={() => setExpanded(false)} destroyOnHidden styles={{ container: { background: theme.node.panel, color: theme.node.text } }} modalRender={(modal) => <div data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{modal}</div>}><div className="flex h-[65vh] min-h-0 flex-col text-2xl">{expanded && editor(true)}</div></Modal>
    </div>;
}

function ParameterMenu({ label, ariaLabel, value, disabled, wide, onOpenChange, children }: { label: string; ariaLabel: string; value: string; disabled?: boolean; wide?: boolean; onOpenChange?: (open: boolean) => void; children: (close: () => void) => ReactNode }) {
    const [open, setOpen] = useState(false);
    const { triggerRef, zoom: menuZoom } = useCanvasMenuZoom(open);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const changeOpen = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
    return <Popover.Root open={open && !disabled} onOpenChange={changeOpen}>
        <Popover.Trigger asChild><button ref={triggerRef} type="button" aria-label={ariaLabel} disabled={disabled} data-canvas-no-zoom className="flex min-w-0 flex-col rounded-2xl border px-3 py-2 text-left outline-none disabled:cursor-not-allowed disabled:opacity-40" style={{ background: theme.node.panel, color: theme.node.text, borderColor: open ? theme.node.activeStroke : theme.node.stroke }}><span className="text-base" style={{ color: theme.node.muted }}>{label}</span><span className="flex w-full items-center justify-between gap-1 text-2xl font-semibold"><span className="truncate">{value}</span><ChevronDown size={16} className="shrink-0 opacity-60" /></span></button></Popover.Trigger>
        <Popover.Portal><Popover.Content aria-label={`${label}选项`} data-canvas-overlay data-canvas-no-zoom className="z-[1200] max-w-[calc(100vw-24px)] rounded-2xl border p-1 shadow-xl outline-none" style={{ width: wide ? 280 : 180, zoom: menuZoom, background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} align="start" sideOffset={8 * menuZoom} collisionPadding={12} updatePositionStrategy="always" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{children(() => changeOpen(false))}</Popover.Content></Popover.Portal>
    </Popover.Root>;
}

function ParameterOptions({ options, value, onChange, columns = 2 }: { options: { value: string; label: string; icon?: ReactNode }[]; value: string; onChange: (value: string) => void; columns?: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{options.map((option) => <button key={option.value} type="button" aria-pressed={option.value === value} className="flex min-h-8 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1 py-1 font-semibold transition-colors hover:opacity-75" style={{ fontSize: 12, lineHeight: "16px", ...(option.value === value ? { background: theme.canvas.selectionStroke, color: theme.node.panel } : {}) }} onClick={() => onChange(option.value)}>{option.icon && <span aria-hidden="true" className="flex w-3 shrink-0 items-center justify-center">{option.icon}</span>}{option.label}</button>)}</div>;
}

function CountParameter({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
    const [custom, setCustom] = useState(false), [draft, setDraft] = useState(String(value));
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <ParameterMenu label="数量" ariaLabel="生成配置数量" value={`${value}张`} disabled={disabled} onOpenChange={(open) => { if (open) { setCustom(false); setDraft(String(value)); } }}>{(close) => <>
        <ParameterOptions value={custom || ![1, 2, 4].includes(value) ? "custom" : String(value)} options={[{ value: "1", label: "1张" }, { value: "2", label: "2张" }, { value: "4", label: "4张" }, { value: "custom", label: "自定义" }]} onChange={(next) => { if (next === "custom") setCustom(true); else { onChange(Number(next)); close(); } }} />
        {custom && <form className="mt-2 flex gap-2 border-t pt-3" style={{ borderColor: theme.node.stroke }} onSubmit={(event) => { event.preventDefault(); const count = Number(draft); if (!Number.isInteger(count) || count < 1 || count > 15) return; onChange(count); close(); }}><input autoFocus aria-label="自定义生成张数" type="number" min={1} max={15} required value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg border px-1 py-1 text-xs outline-none" style={{ background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} /><button type="submit" className="rounded-lg px-2 py-1 text-xs" style={{ background: theme.canvas.selectionStroke, color: theme.node.panel }}>确定</button></form>}
    </>}</ParameterMenu>;
}
