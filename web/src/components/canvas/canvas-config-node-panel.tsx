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

// Panel geometry matches the canvas-world overlay in canvas-node.tsx: a wide,
// elongated box whose prompt area keeps a generous reserved height.
export const CONFIG_PANEL_PROMPT_MIN_HEIGHT = 150;

export function CanvasConfigNodePanel({ node, nodes, inputs, connectedNodes, isRunning, onConfigChange, onGenerate, onStop, onDisconnectReference, onStartReferenceSelection, onAddImageReference }: Props) {
    const global = useEffectiveConfig(), theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [expanded, setExpanded] = useState(false), [compressionOpen, setCompressionOpen] = useState(false);
    const meta = node.metadata || {}, value = meta.composerContent ?? meta.prompt ?? "";
    const config = { ...global, model: resolveModelForCapability(global, meta.model, "image"), size: meta.size || global.size, quality: meta.quality || global.quality, count: String(meta.count || global.canvasImageCount || global.count) };
    const qualityOptions = imageQualityOptions(config.model), quality = imageQualityForModel(config.model, config.quality);
    const compressionEnabled = meta.imageCompressionEnabled === true, compressionResolution = meta.imageCompressionResolution ?? "2k", compressionMaxMb = meta.imageCompressionMaxMb ?? 1;
    const ratio = meta.imageAspectRatio || inferMediaRatio(config.size), resolution = meta.imageResolution || inferMediaScale(config.size);
    const patch = (next: Partial<CanvasNodeMetadata>) => onConfigChange(node.id, next);
    const inputStyle = { background: theme.node.panel, color: theme.node.text, border: `1px solid ${theme.node.stroke}`, borderRadius: 10 };
    const editor = (large: boolean) => <CanvasConfigComposer nodeId={node.id} nodes={nodes} inputs={inputs} connectedNodes={connectedNodes} value={value} embedded expanded={large} fontSize={large ? 16 : 14} onChange={(composerContent) => patch({ composerContent })} onClose={() => setExpanded(false)} onDisconnectReference={onDisconnectReference} onAddImageReference={onAddImageReference} onStartReferenceSelection={(nodeId) => { setExpanded(false); onStartReferenceSelection(nodeId); }} onReorderReferences={isRunning ? undefined : (referenceNodeOrder) => patch({ referenceNodeOrder })} />;
    return <div className="thin-scrollbar flex h-full min-h-0 w-full flex-col overflow-y-auto rounded-[20px] text-sm" style={{ background: theme.node.panel, color: theme.node.text }}>
        <div data-canvas-no-zoom className="flex min-h-0 flex-1 flex-col p-2" onMouseDown={stopWorkflowControlDrag}>
            <div className="mb-1 flex shrink-0 justify-end"><button type="button" aria-label="放大编辑生成配置" className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100" onClick={() => setExpanded(true)}><Maximize2 size={16} />放大编辑</button></div>
            {!expanded ? editor(false) : <p className="opacity-60">正在放大编辑 · 内容实时同步</p>}
        </div>
        <div data-canvas-no-zoom className="shrink-0 space-y-2 border-t p-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }} onMouseDown={stopWorkflowControlDrag}>
            <div className="flex min-w-0 items-center gap-2">
                <span className="inline-block shrink-0 rounded-full px-2.5 py-1 text-xs" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>探索</span>
                <div className="min-w-0 flex-1"><ModelPicker className="!h-10 !gap-2 !rounded-xl !px-3 !text-sm" config={config} value={config.model} onChange={(model) => patch({ model, quality: imageQualityForModel(model, config.quality) })} capability="image" groupByChannel="list" onMissingConfig={() => useConfigStore.getState().openConfigDialog(true)} fullWidth /></div>
                <Button type="primary" shape="circle" aria-label={isRunning ? "停止生成" : "生成图片"} disabled={!isRunning && !value.trim() && !inputs.length} danger={isRunning} style={{ width: 36, height: 36 }} icon={isRunning ? <Square size={15} /> : <Play size={16} />} onClick={() => isRunning ? onStop(node.id) : onGenerate(node.id)} />
            </div>
            <div className="grid grid-cols-4 gap-2">
                <ParameterMenu label="比例" ariaLabel="生成配置比例" value={ratio === "auto" ? "自动" : ratio} disabled={isRunning} wide>{(close) => <ParameterOptions columns={4} value={ratio} options={mediaRatioOptions.map((item) => ({ value: item.value, label: item.value === "auto" ? "自动" : item.value, icon: item.value === "auto" ? <span className="text-xs font-bold">A</span> : <span className="inline-block rounded-[2px] border" style={{ width: Math.min(12, 10 * item.width / item.height), height: Math.min(12, 10 * item.height / item.width) }} /> }))} onChange={(next) => { patch({ imageAspectRatio: next, imageResolution: resolution, size: computeMediaSize(resolution, next) }); close(); }} />}</ParameterMenu>
                <ParameterMenu label="清晰度" ariaLabel="生成配置分辨率" value={resolution === "auto" ? "自动" : resolution.toUpperCase()} disabled={isRunning}>{(close) => <ParameterOptions value={resolution} options={mediaScaleOptions.map((item) => ({ value: item, label: item === "auto" ? "自动" : item.toUpperCase() }))} onChange={(next) => { patch({ imageResolution: next, imageAspectRatio: ratio, size: computeMediaSize(next, ratio) }); close(); }} />}</ParameterMenu>
                <ParameterMenu label="质量" ariaLabel="生成配置质量" value={quality} disabled={isRunning || !qualityOptions.length}>{(close) => <ParameterOptions columns={qualityOptions.length > 4 ? 3 : 2} value={quality} options={qualityOptions.map((item) => ({ value: item, label: item }))} onChange={(next) => { patch({ quality: next }); close(); }} />}</ParameterMenu>
                <CountParameter value={Number(config.count)} disabled={isRunning} onChange={(count) => patch({ count })} />
            </div>
            <div data-image-compression className="border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center justify-between gap-2">
                    <button type="button" className="inline-flex items-center gap-1.5 font-medium" aria-expanded={compressionOpen} onClick={() => setCompressionOpen((open) => !open)}>
                        <ChevronDown size={14} className={`shrink-0 transition-transform ${compressionOpen ? "" : "-rotate-90"}`} />图片压缩
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="text-xs opacity-60">{compressionEnabled ? `${compressionResolution.toUpperCase()} · ${compressionMaxMb} MB` : "未启用"}</span>
                        <button type="button" role="switch" aria-label="图片压缩" aria-checked={compressionEnabled} disabled={isRunning} className="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: compressionEnabled ? theme.toolbar.activeText : theme.node.stroke }} onClick={() => patch({ imageCompressionEnabled: !compressionEnabled })}><span aria-hidden="true" className="absolute left-0.5 top-0.5 size-4 rounded-full shadow-sm transition-transform" style={{ background: theme.node.panel, transform: compressionEnabled ? "translateX(16px)" : "translateX(0)" }} /></button>
                    </div>
                </div>
                {compressionOpen && <div className="mt-2 space-y-2 border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex flex-wrap items-center gap-2"><span>最长边</span><select aria-label="压缩最长边" disabled={!compressionEnabled || isRunning} value={compressionResolution} className="rounded-lg px-2 py-1 text-sm disabled:opacity-50" style={inputStyle} onChange={(event) => patch({ imageCompressionResolution: event.target.value as "1k" | "2k" | "4k" })}>{["1k", "2k", "4k"].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select><label className="ml-auto flex min-w-0 items-center gap-2">单图上限<input aria-label="压缩单图上限 MB" type="number" step="any" disabled={!compressionEnabled || isRunning} value={compressionMaxMb} className="w-16 rounded-lg px-2 py-1 text-sm disabled:opacity-50" style={inputStyle} onChange={(event) => patch({ imageCompressionMaxMb: event.target.value === "" ? 0 : Number(event.target.value) })} />MB</label></div>
                    <p className="text-xs opacity-60">仅压缩发送的参考图，保留画布原图</p>
                </div>}
            </div>
        </div>
        <Modal title="生成配置 · 放大编辑" open={expanded} footer={null} centered width="min(1000px, 94vw)" zIndex={1400} onCancel={() => setExpanded(false)} destroyOnHidden styles={{ container: { background: theme.node.panel, color: theme.node.text } }} modalRender={(modal) => <div data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{modal}</div>}><div className="flex h-[65vh] min-h-0 flex-col text-base">{expanded && editor(true)}</div></Modal>
    </div>;
}

function ParameterMenu({ label, ariaLabel, value, disabled, wide, onOpenChange, children }: { label: string; ariaLabel: string; value: string; disabled?: boolean; wide?: boolean; onOpenChange?: (open: boolean) => void; children: (close: () => void) => ReactNode }) {
    const [open, setOpen] = useState(false);
    const { triggerRef, zoom: menuZoom } = useCanvasMenuZoom(open);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const changeOpen = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
    return <Popover.Root open={open && !disabled} onOpenChange={changeOpen}>
        <Popover.Trigger asChild><button ref={triggerRef} type="button" aria-label={ariaLabel} disabled={disabled} data-canvas-no-zoom className="flex min-w-0 flex-col rounded-xl border px-2.5 py-1.5 text-left outline-none disabled:cursor-not-allowed disabled:opacity-40" style={{ background: theme.node.panel, color: theme.node.text, borderColor: open ? theme.node.activeStroke : theme.node.stroke }}><span className="text-xs" style={{ color: theme.node.muted }}>{label}</span><span className="flex w-full items-center justify-between gap-1 text-sm font-semibold"><span className="truncate">{value}</span><ChevronDown size={14} className="shrink-0 opacity-60" /></span></button></Popover.Trigger>
        <Popover.Portal><Popover.Content aria-label={`${label}选项`} data-canvas-overlay data-canvas-no-zoom className="z-[1200] max-w-[calc(100vw-24px)] rounded-xl border p-1 shadow-xl outline-none" style={{ width: wide ? 240 : 170, zoom: menuZoom, background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} align="start" sideOffset={8 * menuZoom} collisionPadding={12} updatePositionStrategy="always" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{children(() => changeOpen(false))}</Popover.Content></Popover.Portal>
    </Popover.Root>;
}

function ParameterOptions({ options, value, onChange, columns = 2 }: { options: { value: string; label: string; icon?: ReactNode }[]; value: string; onChange: (value: string) => void; columns?: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{options.map((option) => <button key={option.value} type="button" aria-pressed={option.value === value} className="flex min-h-7 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-1 font-semibold transition-colors hover:opacity-75" style={{ fontSize: 12, lineHeight: "16px", ...(option.value === value ? { background: theme.canvas.selectionStroke, color: theme.node.panel } : {}) }} onClick={() => onChange(option.value)}>{option.icon && <span aria-hidden="true" className="flex w-3 shrink-0 items-center justify-center">{option.icon}</span>}{option.label}</button>)}</div>;
}

function CountParameter({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
    const [custom, setCustom] = useState(false), [draft, setDraft] = useState(String(value));
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <ParameterMenu label="数量" ariaLabel="生成配置数量" value={`${value}张`} disabled={disabled} onOpenChange={(open) => { if (open) { setCustom(false); setDraft(String(value)); } }}>{(close) => <>
        <ParameterOptions value={custom || ![1, 2, 4].includes(value) ? "custom" : String(value)} options={[{ value: "1", label: "1张" }, { value: "2", label: "2张" }, { value: "4", label: "4张" }, { value: "custom", label: "自定义" }]} onChange={(next) => { if (next === "custom") setCustom(true); else { onChange(Number(next)); close(); } }} />
        {custom && <form className="mt-2 flex gap-2 border-t pt-2" style={{ borderColor: theme.node.stroke }} onSubmit={(event) => { event.preventDefault(); const count = Number(draft); if (!Number.isInteger(count) || count < 1 || count > 15) return; onChange(count); close(); }}><input autoFocus aria-label="自定义生成张数" type="number" min={1} max={15} required value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm outline-none" style={{ background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} /><button type="submit" className="rounded-lg px-2 py-1 text-sm" style={{ background: theme.canvas.selectionStroke, color: theme.node.panel }}>确定</button></form>}
    </>}</ParameterMenu>;
}
