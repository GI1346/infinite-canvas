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
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";
import { useThemeStore } from "@/stores/use-theme-store";
import { stopWorkflowControlDrag } from "./workflow-node-interactions";
import { AspectRatioPicker } from "./canvas-aspect-ratio-picker";
import { CapsuleSlider } from "./canvas-capsule-slider";
import { CanvasConfigComposer } from "./canvas-config-composer";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasGenerationEditorModal, GenerationReferenceHeader } from "./canvas-generation-editor-modal";
import { CanvasReferenceImagePicker } from "./canvas-reference-image-picker";
import { VideoPresetPromptsModal } from "./canvas-video-modals";
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
    const [collapsed, setCollapsed] = useState(false), [exploring, setExploring] = useState(false), [presetModalOpen, setPresetModalOpen] = useState(false);
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
    const insertPresetPrompt = (text: string) => {
        const clean = text.trim();
        if (!clean) return;
        const base = value.trim();
        if (base.includes(clean)) return;
        patch({ composerContent: base ? `${base}，${clean}` : clean });
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
        <GenerationReferenceHeader theme={theme} count={imageNumbers.size} expanded={large} collapsed={collapsed} onSelect={selectReferences} onAddImage={(image) => onAddImageReference(node.id, image)} onOpenPresets={() => setPresetModalOpen(true)} onExpand={() => setExpanded(true)} onCollapse={() => setCollapsed((previous) => !previous)} onClose={close} />
        {(large || !collapsed) && <>
        {imageNumbers.size ? <CanvasNodeReferenceBar imageNumbers={imageNumbers} nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onReorder={reorderReferences} /> : null}
        <div data-canvas-no-zoom className={large ? "min-h-0 min-w-0 flex-1" : "min-w-0"} onMouseDown={stopWorkflowControlDrag}>{editor(large)}</div>
        <div data-canvas-no-zoom className="relative z-20 shrink-0 border-t pt-2" style={{ borderColor: theme.node.stroke }} onMouseDown={stopWorkflowControlDrag}>
            <div data-config-dock className="flex min-w-0 flex-wrap items-center gap-1.5">
                <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-75" style={badge} onClick={() => setExploring(true)}>探索</button>
                <div className="min-w-0 flex-1"><ModelPicker className="!h-8 !gap-1 !rounded-xl !px-2 !text-xs" config={config} value={config.model} onChange={(model) => patch({ model, quality: imageQualityForModel(model, config.quality) })} capability="image" groupByChannel="list" menuZoom={large ? 1 : undefined} onMissingConfig={() => { if (large) close(); useConfigStore.getState().openConfigDialog(true); }} fullWidth /></div>
                <div className="flex shrink-0 items-center gap-px rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                    <RatioParameter value={ratio} disabled={isRunning} fixedZoom={large ? 1 : undefined} onChange={(next) => patch({ imageAspectRatio: next, imageResolution: resolution, size: computeMediaSize(resolution, next) })} />
                    <ResolutionParameter value={resolution} disabled={isRunning} fixedZoom={large ? 1 : undefined} onChange={(next) => patch({ imageResolution: next, imageAspectRatio: ratio, size: computeMediaSize(next, ratio) })} />
                    <QualityParameter value={quality} options={qualityOptions} disabled={isRunning || !qualityOptions.length} fixedZoom={large ? 1 : undefined} onChange={(next) => patch({ quality: next })} />
                    <CountParameter value={Number(config.count)} disabled={isRunning} fixedZoom={large ? 1 : undefined} onChange={(count) => patch({ count })} />
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
        <VideoPresetPromptsModal open={presetModalOpen} onClose={() => setPresetModalOpen(false)} onInsertPrompt={insertPresetPrompt} />
    </ConfigProvider>;
}

function ParameterMenu({ label, ariaLabel, value, disabled, wide, fixedZoom, onOpenChange, children }: { label: string; ariaLabel: string; value: string; disabled?: boolean; wide?: boolean; fixedZoom?: number; onOpenChange?: (open: boolean) => void; children: (close: () => void) => ReactNode }) {
    const [open, setOpen] = useState(false);
    const { triggerRef, zoom } = useCanvasMenuZoom(open);
    const menuZoom = fixedZoom ?? zoom;
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const changeOpen = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
    return <Popover.Root open={open && !disabled} onOpenChange={changeOpen}>
        <Popover.Trigger asChild><button ref={triggerRef} type="button" aria-label={ariaLabel} disabled={disabled} data-canvas-no-zoom className="inline-flex h-7 min-w-0 max-w-28 items-center justify-center gap-1 rounded-lg px-2 leading-none transition hover:bg-black/5 focus-visible:outline disabled:opacity-40 dark:hover:bg-white/10" style={{ background: open ? theme.node.panel : "transparent", color: theme.node.text }}><span className="text-[10px]" style={{ color: theme.node.muted }}>{label}</span><span key={value} className="bf-digit-roll truncate font-mono text-[11px] font-semibold">{value}</span><ChevronDown size={10} className="shrink-0 opacity-60" /></button></Popover.Trigger>
        <Popover.Portal><Popover.Content aria-label={`${label}选项`} data-canvas-overlay data-canvas-no-zoom className={`bf-spring-pop z-[1250] max-w-[calc(100vw-24px)] border shadow-xl outline-none ${wide ? "rounded-2xl p-3" : "rounded-xl p-2.5"}`} style={{ width: wide ? 340 : 252, zoom: menuZoom, background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} align="center" sideOffset={8 * menuZoom} collisionPadding={12} updatePositionStrategy="always" onEscapeKeyDown={(event) => { if (event.target instanceof HTMLElement && event.target.hasAttribute("data-custom-ratio-input")) event.preventDefault(); }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{children(() => changeOpen(false))}</Popover.Content></Popover.Portal>
    </Popover.Root>;
}

function RatioParameter({ value, disabled, fixedZoom, onChange }: { value: string; disabled: boolean; fixedZoom?: number; onChange: (ratio: string) => void }) {
    const [openVersion, setOpenVersion] = useState(0);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <ParameterMenu
            label="比例"
            ariaLabel="生成配置比例"
            value={value === "auto" ? "自动" : value}
            disabled={disabled}
            wide
            fixedZoom={fixedZoom}
            onOpenChange={(open) => {
                if (open) setOpenVersion((v) => v + 1);
            }}
        >
            {(close) => (
                <AspectRatioPicker
                    theme={theme}
                    options={mediaRatioOptions}
                    value={value}
                    onChange={onChange}
                    onDone={close}
                    title="画幅比例"
                    allowCustom
                    customLabel="自定义比例"
                    customInputAriaLabel="自定义生成比例"
                    resetCustomSignal={openVersion}
                />
            )}
        </ParameterMenu>
    );
}

function ResolutionParameter({ value, disabled, fixedZoom, onChange }: { value: string; disabled: boolean; fixedZoom?: number; onChange: (resolution: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const index = Math.max(0, mediaScaleOptions.findIndex((item) => item === value));
    const current = mediaScaleOptions[index] || mediaScaleOptions[0];
    return <ParameterMenu label="清晰度" ariaLabel="生成配置分辨率" value={value === "auto" ? "自动" : value.toUpperCase()} disabled={disabled} fixedZoom={fixedZoom}>{() => (
        <CapsuleSlider
            theme={theme}
            title="清晰度"
            valueLabel={current === "auto" ? "自动" : current.toUpperCase()}
            min={0}
            max={mediaScaleOptions.length - 1}
            value={index}
            ariaLabel="清晰度滑块"
            stops={mediaScaleOptions.map((item, i) => ({ value: i, label: item === "auto" ? "自动" : item.toUpperCase() }))}
            onChange={(nextIdx) => {
                const picked = mediaScaleOptions[nextIdx];
                if (picked) onChange(picked);
            }}
        />
    )}</ParameterMenu>;
}

function QualityParameter({ value, options, disabled, fixedZoom, onChange }: { value: string; options: string[]; disabled: boolean; fixedZoom?: number; onChange: (quality: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const list = options.length ? options : [value || "auto"];
    const index = Math.max(0, list.findIndex((item) => item === value));
    const current = list[index] || value || "auto";
    return <ParameterMenu label="质量" ariaLabel="生成配置质量" value={value} disabled={disabled} fixedZoom={fixedZoom}>{() => (
        <CapsuleSlider
            theme={theme}
            title="生成质量"
            valueLabel={current}
            min={0}
            max={Math.max(0, list.length - 1)}
            value={index}
            ariaLabel="生成质量滑块"
            stops={list.map((item, i) => ({ value: i, label: item }))}
            onChange={(nextIdx) => {
                const picked = list[nextIdx];
                if (picked) onChange(picked);
            }}
        />
    )}</ParameterMenu>;
}

function CountParameter({ value, disabled, fixedZoom, onChange }: { value: number; disabled: boolean; fixedZoom?: number; onChange: (value: number) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const clamped = Math.max(1, Math.min(15, Math.floor(Number(value) || 1)));
    return <ParameterMenu label="数量" ariaLabel="生成配置数量" value={`${clamped}张`} disabled={disabled} fixedZoom={fixedZoom}>{() => (
        <CapsuleSlider
            theme={theme}
            title="生成数量"
            valueLabel={`${clamped}张`}
            min={1}
            max={15}
            value={clamped}
            ariaLabel="生成数量滑块"
            stops={[
                { value: 1, label: "1张" },
                { value: 2, label: "2张" },
                { value: 4, label: "4张" },
                { value: 8, label: "8张" },
                { value: 15, label: "15张" },
            ]}
            onChange={(next) => onChange(Math.max(1, Math.min(15, next)))}
        />
    )}</ParameterMenu>;
}
