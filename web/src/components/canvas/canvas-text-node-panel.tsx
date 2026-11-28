import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Maximize2, Minimize2, Play, Plus, Sparkles, Square } from "lucide-react";
import { Popover } from "radix-ui";
import { ConfigProvider } from "antd";
import { ModelPicker, useCanvasMenuZoom } from "@/components/model-picker";
import { reasoningEffortLabel } from "@/components/text-settings-panel";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { orderReferenceNodes } from "@/lib/canvas/canvas-resource-references";
import { useAssetStore, type TextAsset } from "@/stores/use-asset-store";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type ReasoningEffort } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { stopWorkflowControlDrag } from "./workflow-node-interactions";
import { CapsuleSlider } from "./canvas-capsule-slider";
import { CanvasConfigComposer } from "./canvas-config-composer";
import { ParameterMenu } from "./canvas-config-node-panel";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasGenerationEditorModal } from "./canvas-generation-editor-modal";
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

const REASONING_OPTIONS: ReasoningEffort[] = ["auto", "low", "medium", "high", "xhigh"];
const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

/**
 * 文本节点下方配置框（对齐生成节点 CanvasConfigNodePanel 的视觉与交互）：
 * - 顶栏最左切换产出模式：「文本」或「多维表格」；
 * - 支持正文（双击节点编辑）与配置框提示词单独填写或协同生效；
 * - 底栏选用文本模型、推理强度、生成数量与生成按钮。
 */
export function CanvasTextNodePanel({
    node,
    nodes,
    inputs,
    connectedNodes,
    isRunning,
    onConfigChange,
    onGenerate,
    onStop,
    onDisconnectReference,
    onStartReferenceSelection,
    onAddImageReference,
}: Props) {
    const global = useEffectiveConfig();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const providerTheme = useMemo(() => ({ token: { colorPrimary: theme.accent.base, colorPrimaryBg: theme.accent.soft, colorInfo: theme.accent.base } }), [theme]);
    const [expanded, setExpanded] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
    const [savedPrompt, setSavedPrompt] = useState(false);
    const { triggerRef: libraryTriggerRef, zoom: libraryZoom } = useCanvasMenuZoom(promptLibraryOpen);

    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const prompts = useMemo(() => assets.filter((asset): asset is TextAsset => asset.kind === "text" && asset.metadata?.resourceType !== "workflow"), [assets]);

    const meta = node.metadata || {};
    const primaryTextId = meta.primaryTextId || meta.texts?.[0]?.id;
    const primaryText = meta.texts?.find((item) => item.id === primaryTextId);
    const bodyText = (primaryText?.content ?? meta.content ?? "").trim();
    const value = meta.composerContent ?? (bodyText ? "" : meta.prompt ?? "");
    const outputMode = meta.llmOutputMode === "list" ? "list" : "text";
    const reasoningEffort = meta.reasoningEffort || global.reasoningEffort || "auto";
    const textCount = Math.max(1, Math.min(15, Math.floor(Number(meta.textCount) || 1)));
    const activeModel = resolveModelForCapability(global, meta.model, "text");
    const config = { ...global, model: activeModel, reasoningEffort };

    const referenceOrder = meta.referenceNodeOrder;
    const imageNumbers = useMemo(() => {
        const images = flattenGenerationInputs(inputs).filter(({ type }) => type === "image");
        return new Map(orderReferenceNodes(images.map(({ nodeId }) => ({ id: nodeId })), referenceOrder).map(({ id }, index) => [id, index + 1]));
    }, [inputs, referenceOrder]);

    const canSavePrompt = Boolean((bodyText || value).trim()) && !savedPrompt;
    const canGenerate = Boolean(value.trim() || bodyText || inputs.length > 0);
    useEffect(() => setSavedPrompt(false), [bodyText, value]);

    const patch = (next: Partial<CanvasNodeMetadata>) => onConfigChange(node.id, next);
    const close = () => setExpanded(false);
    const selectReferences = () => {
        close();
        onStartReferenceSelection(node.id);
    };
    const submit = (large: boolean) => {
        if (isRunning || !canGenerate) return;
        if (large) close();
        onGenerate(node.id, large);
    };
    const insertLibraryPrompt = (content: string) => {
        const clean = content.trim();
        if (!clean) return;
        const base = value.trim();
        patch({ composerContent: base && !base.includes(clean) ? `${base}\n${clean}` : clean });
        setPromptLibraryOpen(false);
    };
    const saveToPromptLibrary = () => {
        const content = (bodyText || value).trim();
        if (!content || savedPrompt) return;
        const defaultTitle = content.split(/\r?\n/)[0].slice(0, 40) || "文本提示词";
        const title = node.title?.trim() && !["文本", "文本提示词", "Text"].includes(node.title.trim()) ? node.title.trim() : defaultTitle;
        addAsset({ kind: "text", title, coverUrl: "", tags: [], source: "画布", data: { content }, metadata: { resourceType: "prompt" } });
        setSavedPrompt(true);
    };

    const composerPlaceholder = outputMode === "list"
        ? (bodyText
            ? "已读取上方正文，可补充多维表格拆解要求（留空则按正文+参考图直接拆表），@ 可引用上游节点"
            : "输入策划或拆解要求（@ 可引用上游图片/文本），生成后自动在右侧输出多维表格")
        : (bodyText
            ? "已有正文：输入润色、修改或继续分析指令（留空可直接按正文+参考图生成），@ 可引用上游节点"
            : "输入提示词或分析要求（@ 可引用上游图片、文本或组），结果写入当前节点");

    const reorderReferences = isRunning ? undefined : (nextOrder: string[]) => patch({ referenceNodeOrder: nextOrder });
    const headerBtnClass = "inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11px] font-medium transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40";
    const iconAction = "grid size-7 shrink-0 place-items-center rounded-lg hover:opacity-70";

    const renderEditor = (large: boolean) => (
        <CanvasConfigComposer
            nodeId={node.id}
            nodes={nodes}
            inputs={inputs}
            connectedNodes={connectedNodes}
            imageNumbers={imageNumbers}
            value={value}
            embedded
            compact={!large}
            expanded={large}
            fontSize={large ? 16 : 12}
            placeholder={composerPlaceholder}
            ariaLabel="文本节点配置提示词"
            onChange={(composerContent) => patch({ composerContent })}
            onRun={isRunning || !canGenerate ? undefined : () => submit(large)}
            onClose={close}
            onDisconnectReference={onDisconnectReference}
            onAddImageReference={onAddImageReference}
            onStartReferenceSelection={(targetId) => {
                setExpanded(false);
                onStartReferenceSelection(targetId);
            }}
            onReorderReferences={reorderReferences}
        />
    );

    const renderPanel = (large: boolean) => (
        <div
            data-config-island
            data-text-config-panel
            data-expanded={large || undefined}
            inert={!large && expanded}
            className={`flex w-full min-w-0 flex-col gap-2 rounded-[20px] border p-2.5 text-sm ${large ? "h-[min(72dvh,760px)]" : ""}`}
            style={{ ...(large ? { borderColor: theme.glass.border } : { ...canvasGlass(theme), backgroundImage: "none" }), color: theme.node.text }}
        >
            {/* 顶栏：最左侧切换输出为「文本 | 多维表格」，右侧收纳参考图与提示词库工具 */}
            <div data-canvas-no-zoom className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5" onMouseDown={stopWorkflowControlDrag}>
                <fieldset aria-label="输出格式" disabled={isRunning} className="inline-flex shrink-0 rounded-xl p-0.5 text-[11px] font-medium" style={{ background: theme.glass.inset }}>
                    {([["text", "文本"], ["list", "多维表格"]] as const).map(([modeValue, label]) => (
                        <button
                            key={modeValue}
                            type="button"
                            aria-pressed={outputMode === modeValue}
                            disabled={isRunning}
                            className="rounded-lg px-2 py-1 transition disabled:opacity-50"
                            style={outputMode === modeValue ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                            onClick={() => patch({ llmOutputMode: modeValue })}
                        >
                            {label}
                        </button>
                    ))}
                </fieldset>
                <button
                    type="button"
                    disabled={isRunning}
                    className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[11px] font-medium hover:opacity-75 disabled:pointer-events-none disabled:opacity-40"
                    style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}
                    title="从画布选择参考图片或文本节点"
                    onClick={selectReferences}
                >
                    <Plus size={12} />参考图{imageNumbers.size ? <span className="tabular-nums">({imageNumbers.size})</span> : null}
                </button>
                <Popover.Root open={promptLibraryOpen && !isRunning} onOpenChange={setPromptLibraryOpen}>
                    <Popover.Trigger asChild>
                        <button
                            ref={libraryTriggerRef}
                            type="button"
                            disabled={isRunning}
                            aria-label="提示词库"
                            title="提示词库"
                            className={headerBtnClass}
                            style={{ background: theme.glass.inset, color: theme.node.text }}
                        >
                            <Sparkles size={12} style={{ color: theme.accent.base }} />
                            <span>提示词库</span>
                        </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Content
                            aria-label="提示词库内容"
                            data-canvas-overlay
                            data-canvas-no-zoom
                            data-canvas-shortcuts-ignore
                            className="bf-spring-pop z-[1250] w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border shadow-xl outline-none"
                            style={{ zoom: large ? 1 : libraryZoom, background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }}
                            side="top"
                            align="start"
                            sideOffset={8 * (large ? 1 : libraryZoom)}
                            collisionPadding={12}
                            onPointerDown={stop}
                            onMouseDown={stop}
                            onClick={stop}
                            onKeyDown={stop}
                            onWheel={stop}
                        >
                            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium" style={{ borderColor: theme.node.stroke }}>
                                <Sparkles size={16} style={{ color: theme.accent.base }} />
                                <span>提示词库</span>
                            </div>
                            <div className="thin-scrollbar max-h-80 min-h-28 overflow-y-auto overscroll-contain p-2">
                                {prompts.length ? prompts.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="flex w-full min-w-0 items-start gap-2 rounded-xl p-2.5 text-left transition hover:opacity-75"
                                        style={{ background: theme.node.fill }}
                                        onClick={() => insertLibraryPrompt(item.data.content)}
                                    >
                                        <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: theme.accent.base }} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-medium">{item.title}</span>
                                            <span className="mt-0.5 block truncate text-[11px]" style={{ color: theme.node.muted }}>{item.data.content}</span>
                                        </span>
                                    </button>
                                )) : (
                                    <div className="grid min-h-24 place-items-center px-4 text-xs" style={{ color: theme.node.muted }}>
                                        提示词库暂无内容
                                    </div>
                                )}
                            </div>
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>
                <button
                    type="button"
                    disabled={!canSavePrompt}
                    className={headerBtnClass}
                    style={{ background: theme.glass.inset, color: theme.node.text }}
                    onClick={saveToPromptLibrary}
                >
                    <Plus size={12} />
                    <span>{savedPrompt ? "已加入" : "加入提示词库"}</span>
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {large ? (
                        <>
                            <span className="text-[11px]" style={{ color: theme.node.muted }}>Esc 退出</span>
                            <button type="button" aria-label="还原配置框" title="还原编辑" className={iconAction} onClick={close}><Minimize2 size={14} /></button>
                        </>
                    ) : (
                        <>
                            <button type="button" aria-label={collapsed ? "展开文本配置" : "收起文本配置"} aria-expanded={!collapsed} className={iconAction} onClick={() => setCollapsed((v) => !v)}>
                                <ChevronDown size={14} className={collapsed ? "rotate-180" : ""} />
                            </button>
                            <button type="button" aria-label="放大编辑文本配置" title="放大编辑" className={iconAction} onClick={() => setExpanded(true)}>
                                <Maximize2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {(large || !collapsed) && (
                <>
                    {imageNumbers.size ? <CanvasNodeReferenceBar imageNumbers={imageNumbers} nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onReorder={reorderReferences} /> : null}
                    <div data-canvas-no-zoom className={large ? "min-h-0 min-w-0 flex-1" : "min-w-0"} onMouseDown={stopWorkflowControlDrag}>
                        {renderEditor(large)}
                    </div>
                    {outputMode === "list" && meta.llmSummary ? (
                        <details data-node-no-drag className="rounded-xl border px-2.5 py-1.5 text-xs" style={{ borderColor: theme.node.stroke, background: theme.glass.inset, color: theme.node.muted }}>
                            <summary className="cursor-pointer select-none font-medium" style={{ color: theme.node.text }}>上次表格分析摘要</summary>
                            <p className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed">{meta.llmSummary}</p>
                        </details>
                    ) : null}
                    {meta.status === "error" && meta.errorDetails ? (
                        <div role="alert" data-node-no-drag className="rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-red-400">
                            {meta.errorDetails}
                        </div>
                    ) : null}
                    <div data-canvas-no-zoom className="relative z-20 shrink-0 border-t pt-2" style={{ borderColor: theme.node.stroke }} onMouseDown={stopWorkflowControlDrag}>
                        <div data-config-dock className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <div className="min-w-0 flex-1">
                                <ModelPicker
                                    className="!h-8 !gap-1 !rounded-xl !px-2 !text-xs"
                                    config={config}
                                    value={config.model}
                                    onChange={(model) => patch({ model })}
                                    capability="text"
                                    groupByChannel="list"
                                    menuZoom={large ? 1 : undefined}
                                    onMissingConfig={() => {
                                        if (large) close();
                                        useConfigStore.getState().openConfigDialog(true);
                                    }}
                                    fullWidth
                                />
                            </div>
                            <div className="flex shrink-0 items-center gap-px rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                                <ReasoningParameter value={reasoningEffort} disabled={isRunning} fixedZoom={large ? 1 : undefined} onChange={(next) => patch({ reasoningEffort: next })} />
                                {outputMode === "text" && (
                                    <TextCountParameter value={textCount} disabled={isRunning} fixedZoom={large ? 1 : undefined} onChange={(next) => patch({ textCount: next })} />
                                )}
                            </div>
                            <button
                                type="button"
                                aria-label={isRunning ? "停止生成" : outputMode === "list" ? "生成多维表格" : "生成文本"}
                                title={isRunning ? "停止生成" : "生成（Ctrl+Enter）"}
                                disabled={!isRunning && !canGenerate}
                                onClick={() => (isRunning ? onStop(node.id) : submit(large))}
                                className="bf-mag-btn flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold shadow-sm disabled:opacity-40"
                                style={{ background: isRunning ? "#ef4444" : `linear-gradient(135deg, ${theme.accent.base}, #12896a)`, color: "white" }}
                            >
                                {isRunning ? (
                                    <><span aria-hidden="true" className="inline-flex gap-0.5"><i className="bf-goo-dot" /><i className="bf-goo-dot" /><i className="bf-goo-dot" /></span>生成中<Square size={9} /></>
                                ) : (
                                    <><Play size={13} />生成</>
                                )}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <ConfigProvider theme={providerTheme}>
            {renderPanel(false)}
            <CanvasGenerationEditorModal open={expanded} onClose={close}>{renderPanel(true)}</CanvasGenerationEditorModal>
        </ConfigProvider>
    );
}

function ReasoningParameter({ value, disabled, fixedZoom, onChange }: { value: ReasoningEffort; disabled: boolean; fixedZoom?: number; onChange: (effort: ReasoningEffort) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const index = Math.max(0, REASONING_OPTIONS.findIndex((item) => item === value));
    const current = REASONING_OPTIONS[index] || "auto";
    return (
        <ParameterMenu label="推理" ariaLabel="推理强度" value={reasoningEffortLabel(current)} disabled={disabled} fixedZoom={fixedZoom}>
            {() => (
                <CapsuleSlider
                    theme={theme}
                    title="推理强度"
                    valueLabel={reasoningEffortLabel(current)}
                    min={0}
                    max={REASONING_OPTIONS.length - 1}
                    value={index}
                    ariaLabel="推理强度滑块"
                    stops={REASONING_OPTIONS.map((item, i) => ({ value: i, label: reasoningEffortLabel(item) }))}
                    onChange={(nextIdx) => {
                        const picked = REASONING_OPTIONS[nextIdx];
                        if (picked) onChange(picked);
                    }}
                />
            )}
        </ParameterMenu>
    );
}

function TextCountParameter({ value, disabled, fixedZoom, onChange }: { value: number; disabled: boolean; fixedZoom?: number; onChange: (count: number) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const clamped = Math.max(1, Math.min(15, Math.floor(Number(value) || 1)));
    return (
        <ParameterMenu label="数量" ariaLabel="生成文本条数" value={`${clamped}条`} disabled={disabled} fixedZoom={fixedZoom}>
            {() => (
                <CapsuleSlider
                    theme={theme}
                    title="生成数量"
                    valueLabel={`${clamped}条`}
                    min={1}
                    max={15}
                    value={clamped}
                    ariaLabel="生成文本数量滑块"
                    stops={[
                        { value: 1, label: "1条" },
                        { value: 2, label: "2条" },
                        { value: 4, label: "4条" },
                        { value: 8, label: "8条" },
                        { value: 15, label: "15条" },
                    ]}
                    onChange={(next) => onChange(Math.max(1, Math.min(15, next)))}
                />
            )}
        </ParameterMenu>
    );
}
