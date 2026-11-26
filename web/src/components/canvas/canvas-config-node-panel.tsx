import { imageQualityForModel, imageQualityOptions } from "@/lib/image-quality";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Minimize2, Play, Square } from "lucide-react";
import { Popover } from "radix-ui";
import { ConfigProvider } from "antd";
import { ModelPicker, useCanvasMenuZoom } from "@/components/model-picker";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { orderReferenceNodes } from "@/lib/canvas/canvas-resource-references";
import { useCanvasImageSettingsStore } from "@/stores/canvas/use-canvas-image-settings-store";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions, parseAspectRatio } from "@/lib/media-size";
import { useThemeStore } from "@/stores/use-theme-store";
import { stopWorkflowControlDrag } from "./workflow-node-interactions";
import { CanvasConfigComposer } from "./canvas-config-composer";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasGenerationEditorModal, GenerationReferenceHeader } from "./canvas-generation-editor-modal";
import { CanvasReferenceImagePicker } from "./canvas-reference-image-picker";
import { flattenGenerationInputs, type NodeGenerationInput } from "./canvas-node-generation";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { GalleryImage } from "@/pages/gallery/gallery-data";

type Props = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    inputs: NodeGenerationInput[];
    connectedNodes: CanvasNodeData[];
    isRunning: boolean;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string, fromExpanded?: boolean) => void;
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
    const providerTheme = useMemo(() => ({ token: { colorPrimary: theme.accent.base, colorPrimaryBg: theme.accent.soft, colorInfo: theme.accent.base } }), [theme]);
    const [expanded, setExpanded] = useState(false), [compressionOpen, setCompressionOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false), [exploring, setExploring] = useState(false);
    const meta = node.metadata || {}, value = meta.composerContent ?? meta.prompt ?? "";
    const referenceOrder = meta.referenceNodeOrder;
    const imageNumbers = useMemo(() => {
        const images = flattenGenerationInputs(inputs).filter(({ type }) => type === "image");
        return new Map(orderReferenceNodes(images.map(({ nodeId }) => ({ id: nodeId })), referenceOrder).map(({ id }, index) => [id, index + 1]));
    }, [inputs, referenceOrder]);
    const config = { ...global, model: resolveModelForCapability(global, meta.model, "image"), size: meta.size || global.size, quality: meta.quality || global.quality, count: String(meta.count || global.canvasImageCount || global.count) };
    const qualityOptions = imageQualityOptions(config.model), quality = imageQualityForModel(config.model, config.quality);
    const compressionEnabled = meta.imageCompressionEnabled === true, compressionResolution = meta.imageCompressionResolution ?? "2k", compressionMaxMb = meta.imageCompressionMaxMb ?? 1;
    const ratio = meta.imageAspectRatio || inferMediaRatio(config.size), resolution = meta.imageResolution || inferMediaScale(config.size);
    const patch = (next: Partial<CanvasNodeMetadata>) => {
        // 配置栏里的选择立即进入记忆，之后新建的图片 / 生成节点直接沿用。
        useCanvasImageSettingsStore.getState().remember(next);
        onConfigChange(node.id, next);
    };
    const inputStyle = { background: theme.node.panel, color: theme.node.text, border: `1px solid ${theme.node.stroke}`, borderRadius: 10 };
    const reorderReferences = isRunning ? undefined : (referenceNodeOrder: string[]) => patch({ referenceNodeOrder });
    const close = () => setExpanded(false);
    const submit = (large: boolean) => {
        if (isRunning || (!value.trim() && !inputs.length)) return;
        if (large) close();
        onGenerate(node.id, large);
    };
    const selectReferences = () => { close(); onStartReferenceSelection(node.id); };
    const editor = (large: boolean) => <CanvasConfigComposer nodeId={node.id} nodes={nodes} inputs={inputs} connectedNodes={connectedNodes} imageNumbers={imageNumbers} value={value} embedded compact={!large} expanded={large} fontSize={large ? 16 : 12} onChange={(composerContent) => patch({ composerContent })} onRun={isRunning || (!value.trim() && !inputs.length) ? undefined : () => submit(large)} onClose={close} onDisconnectReference={onDisconnectReference} onAddImageReference={onAddImageReference} onStartReferenceSelection={(nodeId) => { setExpanded(false); onStartReferenceSelection(nodeId); }} onReorderReferences={reorderReferences} />;
    const badge = { background: theme.accent.soft, color: theme.toolbar.activeText };
    const renderPanel = (large: boolean) => <div data-config-island className={`flex w-full min-w-0 flex-col gap-2 rounded-[20px] border p-2.5 text-sm ${large ? "h-[min(72dvh,760px)]" : ""}`}
        data-expanded={large || undefined} inert={!large && expanded} style={{ ...(large ? { borderColor: theme.glass.border } : { ...canvasGlass(theme), backgroundImage: "none" }), color: theme.node.text }}>
        <GenerationReferenceHeader theme={theme} count={imageNumbers.size} expanded={large} collapsed={collapsed} onSelect={selectReferences} onAddImage={(image) => onAddImageReference(node.id, image)} onExpand={() => setExpanded(true)} onCollapse={() => setCollapsed((previous) => !previous)} onClose={close} />
        {(large || !collapsed) && <>
        {imageNumbers.size ? <CanvasNodeReferenceBar imageNumbers={imageNumbers} nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onReorder={reorderReferences} /> : null}
        <div data-canvas-no-zoom className={large ? "min-h-0 min-w-0 flex-1" : "min-w-0"} onMouseDown={stopWorkflowControlDrag}>{editor(large)}</div>
        <div data-canvas-no-zoom className="relative z-20 shrink-0 border-t pt-2" style={{ borderColor: theme.node.stroke }} onMouseDown={stopWorkflowControlDrag}>
            <div data-config-dock className="flex min-w-0 flex-wrap items-center gap-1.5">
                <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-75" style={badge} onClick={() => setExploring(true)}>探索</button>
                <div className="min-w-0 flex-1"><ModelPicker className="!h-8 !gap-1 !rounded-xl !px-2 !text-xs" config={config} value={config.model} onChange={(model) => patch({ model, quality: imageQualityForModel(model, config.quality) })} capability="image" groupByChannel="list" menuZoom={large ? 1 : undefined} onMissingConfig={() => { if (large) close(); useConfigStore.getState().openConfigDialog(true); }} fullWidth /></div>
                <div className="flex shrink-0 items-center gap-px rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                    <RatioParameter value={ratio} disabled={isRunning} onChange={(next) => patch({ imageAspectRatio: next, imageResolution: resolution, size: computeMediaSize(resolution, next) })} />
                    <ParameterMenu label="清晰度" ariaLabel="生成配置分辨率" value={resolution === "auto" ? "自动" : resolution.toUpperCase()} disabled={isRunning}>{(close) => <ParameterOptions value={resolution} options={mediaScaleOptions.map((item) => ({ value: item, label: item === "auto" ? "自动" : item.toUpperCase() }))} onChange={(next) => { patch({ imageResolution: next, imageAspectRatio: ratio, size: computeMediaSize(next, ratio) }); close(); }} />}</ParameterMenu>
                    <ParameterMenu label="质量" ariaLabel="生成配置质量" value={quality} disabled={isRunning || !qualityOptions.length}>{(close) => <ParameterOptions columns={qualityOptions.length > 4 ? 3 : 2} value={quality} options={qualityOptions.map((item) => ({ value: item, label: item }))} onChange={(next) => { patch({ quality: next }); close(); }} />}</ParameterMenu>
                    <CountParameter value={Number(config.count)} disabled={isRunning} onChange={(count) => patch({ count })} />
                </div>
                <button type="button" aria-label="图片压缩设置" title="图片压缩设置" aria-expanded={compressionOpen} className="relative grid size-8 shrink-0 place-items-center rounded-xl hover:opacity-70" style={compressionOpen ? badge : { color: theme.node.muted }} onClick={() => setCompressionOpen((open) => !open)}><Minimize2 size={15} />{compressionEnabled && <span className="absolute right-1 top-1 size-1.5 rounded-full" style={{ background: theme.accent.base }} />}</button>
                <button type="button" aria-label={isRunning ? "停止生成" : "生成图片"} title={isRunning ? "停止生成" : "生成图片（Ctrl+Enter）"} disabled={!isRunning && !value.trim() && !inputs.length} onClick={() => isRunning ? onStop(node.id) : submit(large)} className="bf-mag-btn flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold shadow-sm disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${theme.accent.base}, #12896a)`, color: "white" }}>
                    {isRunning ? <><span aria-hidden="true" className="inline-flex gap-0.5"><i className="bf-goo-dot" /><i className="bf-goo-dot" /><i className="bf-goo-dot" /></span>生成中<Square size={9} /></> : <><Play size={13} />生成</>}
                </button>
            </div>
            <div data-image-compression className="bf-morph-drawer" data-open={compressionOpen} inert={!compressionOpen}>
                <div><div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-xs" style={{ borderColor: theme.node.stroke }}>
                    <button type="button" role="switch" aria-label="图片压缩" aria-checked={compressionEnabled} disabled={isRunning} className="rounded-lg px-2 py-1 disabled:opacity-50" style={compressionEnabled ? badge : inputStyle} onClick={() => patch({ imageCompressionEnabled: !compressionEnabled })}>图片压缩 · {compressionEnabled ? "已启用" : "未启用"}</button>
                    <label className="flex items-center gap-1">最长边<select aria-label="压缩最长边" disabled={!compressionEnabled || isRunning} value={compressionResolution} className="rounded-lg px-2 py-1 disabled:opacity-50" style={inputStyle} onChange={(event) => patch({ imageCompressionResolution: event.target.value as "1k" | "2k" | "4k" })}>{["1k", "2k", "4k"].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label>
                    <label className="flex items-center gap-1">单图上限<input aria-label="压缩单图上限 MB" type="number" step="any" disabled={!compressionEnabled || isRunning} value={compressionMaxMb} className="w-14 rounded-lg px-2 py-1 disabled:opacity-50" style={inputStyle} onChange={(event) => patch({ imageCompressionMaxMb: event.target.value === "" ? 0 : Number(event.target.value) })} />MB</label>
                    <span className="ml-auto opacity-60">仅压缩参考图，保留原图</span>
                </div></div>
            </div>
        </div>
        </>}
    </div>;
    return <ConfigProvider theme={providerTheme}>
        {renderPanel(false)}
        <CanvasGenerationEditorModal open={expanded} onClose={close}>{renderPanel(true)}</CanvasGenerationEditorModal>
        {exploring && <CanvasReferenceImagePicker initialTab="all" onClose={() => setExploring(false)} onSelect={async (image) => { await onAddImageReference(node.id, image); setExploring(false); }} />}
    </ConfigProvider>;
}

function ParameterMenu({ label, ariaLabel, value, disabled, wide, onOpenChange, children }: { label: string; ariaLabel: string; value: string; disabled?: boolean; wide?: boolean; onOpenChange?: (open: boolean) => void; children: (close: () => void) => ReactNode }) {
    const [open, setOpen] = useState(false);
    const { triggerRef, zoom: menuZoom } = useCanvasMenuZoom(open);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const changeOpen = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
    return <Popover.Root open={open && !disabled} onOpenChange={changeOpen}>
        <Popover.Trigger asChild><button ref={triggerRef} type="button" aria-label={ariaLabel} disabled={disabled} data-canvas-no-zoom className="flex min-w-0 max-w-24 items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-black/5 focus-visible:outline disabled:opacity-40 dark:hover:bg-white/10" style={{ color: theme.node.text, borderColor: open ? theme.node.activeStroke : undefined }}><span className="text-[10px]" style={{ color: theme.node.muted }}>{label}</span><span key={value} className="bf-digit-roll truncate text-[11px] font-semibold">{value}</span><ChevronDown size={10} className="shrink-0 opacity-60" /></button></Popover.Trigger>
        <Popover.Portal><Popover.Content aria-label={`${label}选项`} data-canvas-overlay data-canvas-no-zoom className="bf-spring-pop z-[1200] max-w-[calc(100vw-24px)] rounded-xl border p-1 shadow-xl outline-none" style={{ width: wide ? 240 : 170, zoom: menuZoom, background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} align="start" sideOffset={8 * menuZoom} collisionPadding={12} updatePositionStrategy="always" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{children(() => changeOpen(false))}</Popover.Content></Popover.Portal>
    </Popover.Root>;
}

function ParameterOptions({ options, value, onChange, columns = 2 }: { options: { value: string; label: string; icon?: ReactNode }[]; value: string; onChange: (value: string) => void; columns?: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{options.map((option) => <button key={option.value} type="button" aria-pressed={option.value === value} className="flex min-h-7 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-1 font-semibold transition-colors hover:opacity-75" style={{ fontSize: 12, lineHeight: "16px", ...(option.value === value ? { background: theme.accent.soft, color: theme.accent.base } : {}) }} onClick={() => onChange(option.value)}>{option.icon && <span aria-hidden="true" className="flex w-3 shrink-0 items-center justify-center">{option.icon}</span>}{option.label}</button>)}</div>;
}

function RatioParameter({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (ratio: string) => void }) {
    const [custom, setCustom] = useState(false), [draft, setDraft] = useState("");
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isPreset = mediaRatioOptions.some((item) => item.value === value);
    return <ParameterMenu label="比例" ariaLabel="生成配置比例" value={value === "auto" ? "自动" : value} disabled={disabled} wide onOpenChange={(open) => { if (open) { setCustom(false); setDraft(isPreset ? "" : value); } }}>{(close) => <>
        <ParameterOptions columns={4} value={isPreset ? value : "custom"} options={[...mediaRatioOptions.map((item) => ({ value: item.value, label: item.value === "auto" ? "自动" : item.value, icon: item.value === "auto" ? <span className="text-xs font-bold">A</span> : <span className="inline-block rounded-[2px] border" style={{ width: Math.min(12, 10 * item.width / item.height), height: Math.min(12, 10 * item.height / item.width) }} /> })), { value: "custom", label: "自定义" }]} onChange={(next) => { if (next === "custom") { setCustom(true); return; } onChange(next); close(); }} />
        {custom && <form className="mt-2 flex gap-2 border-t pt-2" style={{ borderColor: theme.node.stroke }} onSubmit={(event) => { event.preventDefault(); const parsed = parseAspectRatio(draft.replace(/：/g, ":").replace(/\s/g, "")); if (!parsed) return; onChange(`${parsed.width}:${parsed.height}`); close(); }}><input autoFocus aria-label="自定义生成比例" placeholder="9:1" value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm outline-none" style={{ background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} /><button type="submit" className="rounded-lg px-2 py-1 text-sm" style={{ background: theme.accent.soft, color: theme.accent.base }}>确定</button></form>}
    </>}</ParameterMenu>;
}

function CountParameter({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
    const [custom, setCustom] = useState(false), [draft, setDraft] = useState(String(value));
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <ParameterMenu label="数量" ariaLabel="生成配置数量" value={`${value}张`} disabled={disabled} onOpenChange={(open) => { if (open) { setCustom(false); setDraft(String(value)); } }}>{(close) => <>
        <ParameterOptions value={custom || ![1, 2, 4].includes(value) ? "custom" : String(value)} options={[{ value: "1", label: "1张" }, { value: "2", label: "2张" }, { value: "4", label: "4张" }, { value: "custom", label: "自定义" }]} onChange={(next) => { if (next === "custom") setCustom(true); else { onChange(Number(next)); close(); } }} />
        {custom && <form className="mt-2 flex gap-2 border-t pt-2" style={{ borderColor: theme.node.stroke }} onSubmit={(event) => { event.preventDefault(); const count = Number(draft); if (!Number.isInteger(count) || count < 1 || count > 15) return; onChange(count); close(); }}><input autoFocus aria-label="自定义生成张数" type="number" min={1} max={15} required value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm outline-none" style={{ background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} /><button type="submit" className="rounded-lg px-2 py-1 text-sm" style={{ background: theme.accent.soft, color: theme.accent.base }}>确定</button></form>}
    </>}</ParameterMenu>;
}
