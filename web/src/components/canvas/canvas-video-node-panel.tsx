import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, ChevronUp, Film, ImagePlus, LoaderCircle, Maximize2, Play, Sparkles, Square, Users, Video as VideoIcon, Volume2, VolumeX, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useTranslation } from "react-i18next";

import { ModelPicker, useCanvasMenuZoom } from "@/components/model-picker";
import { normalizeVideoModeValue } from "@/components/video-settings-panel";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { buildGenerationConfig } from "@/lib/canvas/canvas-generation-helpers";
import { buildCanvasResourceReferences, getGroupResourceNodes, orderReferenceNodes, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { VIDEO_QUICK_CAMERA_CHIPS } from "@/lib/canvas/video-presets";
import { clampVideoResolutionToStops, clampVideoSecondsToRange, computeVideoSize, formatVideoResolutionLabel, inferVideoRatio, videoDurationRangeForModel, videoDurationStopsForRange, videoRatioOptions, videoResolutionStopsForModel } from "@/lib/media-size";
import { boolConfig, decodeChannelModel, modelOptionName, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { GalleryImage } from "@/pages/gallery/gallery-data";
import { CanvasGenerationEditorModal, composerInputSurface, expandedComposerInputSurface } from "./canvas-generation-editor-modal";
import { AspectRatioPicker } from "./canvas-aspect-ratio-picker";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { VideoCharacterLibraryModal, VideoMovementLibraryModal, VideoPresetPromptsModal } from "./canvas-video-modals";

type Props = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    isRunning: boolean;
    mentionReferences?: CanvasResourceReference[];
    connectedNodes?: CanvasNodeData[];
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: "video", prompt: string, fromExpanded?: boolean) => void;
    onStop: (nodeId: string) => void;
    onDisconnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection?: (nodeId: string) => void;
    onAddImageReference?: (nodeId: string, image: GalleryImage) => Promise<unknown>;
};

const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

function appendPromptClause(current: string, clause: string) {
    const clean = clause.trim();
    if (!clean) return current;
    const base = current.trim();
    if (!base) return clean;
    if (base.includes(clean)) return current;
    return `${base}，${clean}`;
}

export function CanvasVideoNodePanel({
    node,
    nodes,
    isRunning,
    mentionReferences = [],
    connectedNodes = [],
    onConfigChange,
    onGenerate,
    onStop,
    onDisconnectReference,
    onStartReferenceSelection,
    onAddImageReference,
}: Props) {
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = buildGenerationConfig(globalConfig, node, "video");

    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    const [expanded, setExpanded] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [characterModalOpen, setCharacterModalOpen] = useState(false);
    const [movementModalOpen, setMovementModalOpen] = useState(false);
    const [presetModalOpen, setPresetModalOpen] = useState(false);

    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    const videoMode = normalizeVideoModeValue(config.videoMode);
    const channelApiFormatFor = (modelValue: string | undefined) => {
        const decoded = decodeChannelModel(modelValue || "");
        return decoded ? globalConfig.channels.find((item) => item.id === decoded.channelId)?.apiFormat : undefined;
    };
    const resolutionStopsFor = (modelValue: string | undefined) =>
        videoResolutionStopsForModel(modelOptionName(modelValue || ""), channelApiFormatFor(modelValue));
    const durationRangeFor = (modelValue: string | undefined) =>
        videoDurationRangeForModel(modelOptionName(modelValue || ""), channelApiFormatFor(modelValue));
    const resolutionStops = useMemo(() => resolutionStopsFor(config.model), [config.model, globalConfig.channels]);
    const durationRange = useMemo(() => durationRangeFor(config.model), [config.model, globalConfig.channels]);
    const durationStops = useMemo(() => videoDurationStopsForRange(durationRange), [durationRange]);
    const resolution = clampVideoResolutionToStops(config.vquality, resolutionStops);
    const ratio = inferVideoRatio(node.metadata?.size || "16:9");
    const seconds = clampVideoSecondsToRange(config.videoSeconds || "6", durationRange);
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);

    const upstreamNodes = useMemo(
        () => connectedNodes.flatMap((input) => (input.type === CanvasNodeType.Group ? getGroupResourceNodes(input.id, nodes) : [input])),
        [connectedNodes, nodes],
    );
    const orderedImageNodes = useMemo(
        () => orderReferenceNodes(upstreamNodes.filter((item) => item.type === CanvasNodeType.Image && Boolean(item.metadata?.content)), node.metadata?.referenceNodeOrder),
        [upstreamNodes, node.metadata?.referenceNodeOrder],
    );
    const imageNumbers = useMemo(
        () => new Map(mentionReferences.filter((item) => item.active && item.kind === "image").map(({ nodeId }, index) => [nodeId, index + 1])),
        [mentionReferences],
    );
    const canGenerate = Boolean(prompt.trim()) || buildCanvasResourceReferences(upstreamNodes).some((ref) => Boolean(ref.text?.trim()));

    const updatePrompt = (value: string) => {
        setPrompt(value);
        onConfigChange(node.id, { composerContent: value });
    };

    const insertClause = (clause: string) => updatePrompt(appendPromptClause(prompt, clause));

    const close = () => setExpanded(false);
    const submit = (large = false) => {
        if (!canGenerate || isRunning) return;
        if (large) close();
        onGenerate(node.id, "video", prompt.trim(), large);
    };

    const swapStartEndFrames = () => {
        if (isRunning || orderedImageNodes.length < 2) return;
        const ids = orderedImageNodes.map((item) => item.id);
        const swapped = [ids[1], ids[0], ...ids.slice(2)];
        onConfigChange(node.id, { referenceNodeOrder: swapped });
    };

    const applyRatio = (nextRatio: string) => {
        onConfigChange(node.id, { vquality: resolution, size: computeVideoSize(resolution, nextRatio) });
    };

    const applyResolution = (nextRes: string) => {
        onConfigChange(node.id, { vquality: nextRes, ...(ratio === "auto" ? {} : { size: computeVideoSize(nextRes, ratio) }) });
    };

    const pickCharacterSheet = async (item: { title: string; url: string }) => {
        if (!onAddImageReference) return;
        await onAddImageReference(node.id, {
            id: `char-${item.url}`,
            title: item.title,
            url: item.url,
            width: 720,
            height: 960,
            category: "角色库",
            prompt: "",
        } as GalleryImage);
    };

    const toolChipClass = "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition hover:bg-black/[0.06] dark:hover:bg-white/[0.09] disabled:opacity-40";

    const renderFrameSlot = (slotLabel: string, dotColor: string, frameNode: CanvasNodeData | undefined) => (
        <div
            className="group relative flex min-w-0 flex-1 items-center gap-2 rounded-xl border p-1.5 transition"
            style={{ borderColor: frameNode ? theme.glass.insetBorder : theme.node.stroke, borderStyle: frameNode ? "solid" : "dashed", background: theme.glass.inset }}
        >
            {frameNode?.metadata?.content ? (
                <>
                    <img src={frameNode.metadata.content} alt={slotLabel} draggable={false} className="h-10 w-14 shrink-0 rounded-lg border object-cover" style={{ borderColor: theme.glass.insetBorder }} />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: dotColor }}>
                            <span className="size-1.5 rounded-full" style={{ background: dotColor }} />
                            <span>{slotLabel}</span>
                        </div>
                        <div className="truncate text-[11px]" style={{ color: theme.node.muted }}>{frameNode.title || "参考图"}</div>
                    </div>
                    {onDisconnectReference && !isRunning && (
                        <button type="button" aria-label={`移除${slotLabel}`} className="grid size-5 shrink-0 place-items-center rounded-md opacity-0 transition hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={() => onDisconnectReference(frameNode.id, node.id)}>
                            <X className="size-3" />
                        </button>
                    )}
                </>
            ) : (
                <button
                    type="button"
                    disabled={isRunning}
                    className="flex h-10 w-full items-center justify-center gap-1.5 text-[11px] transition hover:opacity-80 disabled:opacity-40"
                    style={{ color: theme.node.muted }}
                    onClick={() => onStartReferenceSelection ? onStartReferenceSelection(node.id) : setCharacterModalOpen(true)}
                >
                    <ImagePlus className="size-3.5" style={{ color: dotColor }} />
                    <span>添加{slotLabel}</span>
                </button>
            )}
        </div>
    );

    const renderPanel = (large: boolean) => (
        <div
            data-canvas-no-zoom
            data-config-video
            data-expanded={large || undefined}
            inert={!large && expanded}
            className={`flex w-full min-w-0 flex-col gap-2 rounded-[20px] border p-2.5 text-xs ${large ? "h-[min(72dvh,760px)]" : ""}`}
            style={{ ...(large ? { borderColor: theme.glass.border, background: theme.node.panel } : { ...canvasGlass(theme), backgroundImage: "none" }), color: theme.node.text }}
            onMouseDown={stop}
            onPointerDown={stop}
            onWheel={stop}
        >
            {/* 顶栏：模式切换 + 角色库 / 运镜 / 预设提示词 / 画布参考 + 放大/收起 */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <div className="inline-flex shrink-0 rounded-xl p-0.5 text-[11px] font-medium" style={{ background: theme.glass.inset }}>
                    {([["frames", "首尾帧"], ["reference", "多图参考"]] as const).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            disabled={isRunning}
                            className="rounded-lg px-2 py-1 transition"
                            style={videoMode === value ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                            onClick={() => onConfigChange(node.id, { videoMode: value })}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {onStartReferenceSelection && (
                    <button type="button" disabled={isRunning} className={toolChipClass} style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => { if (large) close(); onStartReferenceSelection(node.id); }}>
                        <ImagePlus className="size-3.5" />画布参考
                    </button>
                )}
                {onAddImageReference && (
                    <button type="button" disabled={isRunning} className={toolChipClass} style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => setCharacterModalOpen(true)}>
                        <Users className="size-3.5" style={{ color: theme.accent.base }} />角色库
                    </button>
                )}
                <button type="button" disabled={isRunning} className={toolChipClass} style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => setMovementModalOpen(true)}>
                    <VideoIcon className="size-3.5" style={{ color: theme.accent.base }} />运镜
                </button>
                <button type="button" disabled={isRunning} className={toolChipClass} style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => setPresetModalOpen(true)}>
                    <Sparkles className="size-3.5" style={{ color: theme.accent.base }} />预设提示词
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {!large && (
                        <button type="button" aria-label="放大编辑" title="放大编辑" className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={() => setExpanded(true)}>
                            <Maximize2 className="size-3.5" />
                        </button>
                    )}
                    {large ? (
                        <button type="button" aria-label="关闭放大编辑" className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={close}>
                            <X className="size-4" />
                        </button>
                    ) : (
                        <button type="button" aria-label={collapsed ? "展开视频面板" : "收起视频面板"} className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={() => setCollapsed((v) => !v)}>
                            {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                    )}
                </div>
            </div>

            {(large || !collapsed) && (
                <>
                    {/* 参考素材区：首尾帧双槽（支持一键互换）或 多图参考胶片条 */}
                    {videoMode === "frames" ? (
                        <div className="flex items-center gap-1.5">
                            {renderFrameSlot("首帧", theme.accent.base, orderedImageNodes[0])}
                            <button
                                type="button"
                                aria-label="互换首尾帧"
                                title="互换首帧与尾帧"
                                disabled={isRunning || orderedImageNodes.length < 2}
                                className="grid size-7 shrink-0 place-items-center rounded-xl transition hover:scale-105 disabled:opacity-35"
                                style={{ background: theme.accent.soft, color: theme.accent.base }}
                                onClick={swapStartEndFrames}
                            >
                                <ArrowLeftRight className="size-3.5" />
                            </button>
                            {renderFrameSlot("尾帧（可选）", "#38bdf8", orderedImageNodes[1])}
                        </div>
                    ) : (
                        <>
                            {imageNumbers.size > 0 && <CanvasNodeReferenceBar nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} imageNumbers={imageNumbers} onDisconnect={onDisconnectReference} onReorder={isRunning ? undefined : (referenceNodeOrder) => onConfigChange(node.id, { referenceNodeOrder })} />}
                            <CanvasNodeReferenceBar nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onlyNonImages onDisconnect={onDisconnectReference} onReorder={isRunning ? undefined : (referenceNodeOrder) => onConfigChange(node.id, { referenceNodeOrder })} />
                        </>
                    )}

                    {/* 提示词与运镜快捷词 */}
                    <div className={`flex min-w-0 flex-col gap-1.5 ${large ? "min-h-0 flex-1" : ""}`}>
                        <CanvasPromptChipInput
                            value={prompt}
                            references={mentionReferences}
                            ariaLabel="生成配置提示词"
                            onChange={updatePrompt}
                            onSubmit={() => submit(large)}
                            onEscape={large ? close : undefined}
                            submitWithModifier
                            containerClassName={large ? "min-h-0 flex-1" : undefined}
                            className={`thin-scrollbar w-full cursor-text resize-none overflow-y-auto px-3 py-2 outline-none ${large ? "h-full min-h-0 text-base leading-7" : "h-28 text-xs leading-5"} ${large ? expandedComposerInputSurface : composerInputSurface}`}
                            style={{ color: theme.node.text, borderColor: theme.node.stroke }}
                            placeholder={t("canvas.promptPanel.video")}
                        />
                        <div className="flex flex-wrap items-center gap-1">
                            <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: theme.node.muted }}><Film className="size-3" />运镜词：</span>
                            {VIDEO_QUICK_CAMERA_CHIPS.map((chip) => (
                                <button
                                    key={chip.label}
                                    type="button"
                                    disabled={isRunning}
                                    className="rounded-full px-2 py-0.5 text-[10px] transition hover:brightness-110 disabled:opacity-40"
                                    style={{ background: theme.glass.inset, color: theme.node.muted }}
                                    onClick={() => insertClause(chip.prompt)}
                                >
                                    + {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 底部一排参数停靠条 */}
                    <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: theme.glass.insetBorder }}>
                        <div className="min-w-[130px] flex-1">
                            <ModelPicker
                                groupByChannel="list"
                                menuZoom={large ? 1 : undefined}
                                config={config}
                                value={config.model}
                                onChange={(model) => {
                                    const nextStops = resolutionStopsFor(model);
                                    const nextResolution = clampVideoResolutionToStops(config.vquality, nextStops);
                                    const nextSeconds = clampVideoSecondsToRange(config.videoSeconds || "6", durationRangeFor(model));
                                    const nextSize = ratio === "auto" ? "auto" : computeVideoSize(nextResolution, ratio);
                                    onConfigChange(node.id, { model, vquality: nextResolution, seconds: nextSeconds, size: nextSize });
                                }}
                                capability="video"
                                fullWidth
                                disabled={isRunning}
                                onMissingConfig={() => { if (large) close(); openConfigDialog(true); }}
                                className="!h-8 !gap-1 !rounded-xl !px-2 !text-xs"
                            />
                        </div>
                        <div className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-xl p-0.5 text-[11px]" style={{ background: theme.glass.inset }}>
                            <VideoParamMenu
                                ariaLabel="视频比例"
                                label="比例"
                                value={ratio === "auto" ? "自动" : ratio}
                                disabled={isRunning}
                                menuWidth={268}
                                fixedZoom={large ? 1 : undefined}
                            >
                                {(closeMenu) => (
                                    <AspectRatioPicker
                                        theme={theme}
                                        options={videoRatioOptions}
                                        value={ratio}
                                        onChange={applyRatio}
                                        onDone={closeMenu}
                                        title="视频比例"
                                        columns={3}
                                    />
                                )}
                            </VideoParamMenu>
                            <VideoParamMenu
                                ariaLabel="视频清晰度"
                                label="清晰"
                                value={formatVideoResolutionLabel(resolution)}
                                disabled={isRunning}
                                wide
                                fixedZoom={large ? 1 : undefined}
                            >
                                {() => {
                                    if (resolutionStops.length <= 1) {
                                        const only = resolutionStops[0] || { value: resolution, label: formatVideoResolutionLabel(resolution) };
                                        return (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span style={{ color: theme.node.muted }}>视频清晰度</span>
                                                    <span className="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold" style={{ background: theme.accent.soft, color: theme.accent.base }}>
                                                        {only.label}
                                                    </span>
                                                </div>
                                                <div className="text-[11px]" style={{ color: theme.node.muted }}>
                                                    当前模型固定支持 {only.label} 输出
                                                </div>
                                            </div>
                                        );
                                    }
                                    const index = Math.max(0, resolutionStops.findIndex((item) => item.value === resolution));
                                    const current = resolutionStops[index] || resolutionStops[0];
                                    return (
                                        <VideoCapsuleSlider
                                            title="视频清晰度"
                                            valueLabel={current.label}
                                            min={0}
                                            max={resolutionStops.length - 1}
                                            value={index}
                                            ariaLabel="视频清晰度滑块"
                                            stops={resolutionStops.map((item, i) => ({ value: i, label: item.label }))}
                                            onChange={(nextIdx) => {
                                                const picked = resolutionStops[nextIdx];
                                                if (picked) applyResolution(picked.value);
                                            }}
                                        />
                                    );
                                }}
                            </VideoParamMenu>
                            <VideoParamMenu
                                ariaLabel="视频时长"
                                label="时长"
                                value={`${seconds}s`}
                                disabled={isRunning}
                                wide
                                fixedZoom={large ? 1 : undefined}
                            >
                                {() => {
                                    const numSeconds = Number(seconds) || durationRange.min;
                                    if (durationRange.min >= durationRange.max) {
                                        return (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span style={{ color: theme.node.muted }}>视频时长</span>
                                                    <span className="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold" style={{ background: theme.accent.soft, color: theme.accent.base }}>
                                                        {durationRange.min}s
                                                    </span>
                                                </div>
                                                <div className="text-[11px]" style={{ color: theme.node.muted }}>
                                                    当前模型固定支持 {durationRange.min}s 输出
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <VideoCapsuleSlider
                                            title={`视频时长 (${durationRange.min}–${durationRange.max}s)`}
                                            valueLabel={`${numSeconds}s`}
                                            min={durationRange.min}
                                            max={durationRange.max}
                                            value={numSeconds}
                                            ariaLabel="视频时长滑块"
                                            stops={durationStops}
                                            onChange={(next) => onConfigChange(node.id, { seconds: clampVideoSecondsToRange(next, durationRange) })}
                                        />
                                    );
                                }}
                            </VideoParamMenu>
                            <span className="mx-0.5 h-4 w-px shrink-0" style={{ background: theme.glass.insetBorder }} />
                            <button
                                type="button"
                                aria-label="视频音频开关"
                                title={generateAudio ? "已开启音频生成" : "已设为静音"}
                                disabled={isRunning}
                                className="inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium leading-none transition hover:opacity-85 disabled:opacity-45"
                                style={generateAudio ? { background: theme.accent.soft, color: theme.accent.base } : { color: theme.node.muted }}
                                onClick={() => onConfigChange(node.id, { generateAudio: generateAudio ? "false" : "true" })}
                            >
                                {generateAudio ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                                <span>{generateAudio ? "音频" : "静音"}</span>
                            </button>
                            <button
                                type="button"
                                aria-label="视频水印开关"
                                title={watermark ? "生成结果带水印" : "生成结果无水印"}
                                disabled={isRunning}
                                className="inline-flex h-7 items-center justify-center rounded-lg px-2 text-[11px] font-medium leading-none transition hover:opacity-85 disabled:opacity-45"
                                style={watermark ? { background: "rgba(245,158,11,0.16)", color: "#f59e0b" } : { color: theme.node.muted }}
                                onClick={() => onConfigChange(node.id, { watermark: watermark ? "false" : "true" })}
                            >
                                {watermark ? "水印" : "无水印"}
                            </button>
                        </div>
                        <button
                            type="button"
                            aria-label={t(isRunning ? "canvas.promptPanel.stopGeneration" : "canvas.promptPanel.generate")}
                            disabled={!isRunning && !canGenerate}
                            onClick={() => (isRunning ? onStop(node.id) : submit(large))}
                            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-40"
                            style={{ background: isRunning ? "#ef4444" : `linear-gradient(135deg, ${theme.accent.base}, #12896a)` }}
                        >
                            {isRunning ? (
                                <>
                                    <LoaderCircle className="size-3.5 animate-spin" />
                                    <Square className="size-3 fill-current" />
                                    <span>{t("canvas.promptPanel.stop")}</span>
                                </>
                            ) : (
                                <>
                                    <Play className="size-3.5" />
                                    <span>生成</span>
                                </>
                            )}
                        </button>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <>
            {renderPanel(false)}
            <CanvasGenerationEditorModal open={expanded} onClose={close}>{renderPanel(true)}</CanvasGenerationEditorModal>
            <VideoCharacterLibraryModal open={characterModalOpen} onClose={() => setCharacterModalOpen(false)} onPickSheet={pickCharacterSheet} />
            <VideoMovementLibraryModal open={movementModalOpen} onClose={() => setMovementModalOpen(false)} onSelectMovement={(movement) => insertClause(`${movement.name}：${movement.prompt}`)} />
            <VideoPresetPromptsModal open={presetModalOpen} onClose={() => setPresetModalOpen(false)} onInsertPrompt={insertClause} />
        </>
    );
}

function VideoParamMenu({ label, ariaLabel, value, disabled, wide, menuWidth, fixedZoom, children }: { label: string; ariaLabel: string; value: string; disabled?: boolean; wide?: boolean; menuWidth?: number; fixedZoom?: number; children: (close: () => void) => ReactNode }) {
    const [open, setOpen] = useState(false);
    const { triggerRef, zoom } = useCanvasMenuZoom(open);
    const menuZoom = fixedZoom ?? zoom;
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    aria-label={ariaLabel}
                    disabled={disabled}
                    data-canvas-no-zoom
                    className="inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-lg px-2 leading-none transition hover:bg-black/5 focus-visible:outline disabled:opacity-40 dark:hover:bg-white/10"
                    style={{ background: open ? theme.node.panel : "transparent", color: theme.node.text }}
                >
                    <span className="text-[10px]" style={{ color: theme.node.muted }}>{label}</span>
                    <span className="font-mono text-[11px] font-semibold">{value}</span>
                    <ChevronDown size={11} className="shrink-0 opacity-55" />
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    aria-label={`${label}选项`}
                    data-canvas-overlay
                    data-canvas-no-zoom
                    className={`bf-spring-pop z-[1250] max-w-[calc(100vw-24px)] border shadow-xl outline-none ${menuWidth ? "rounded-2xl p-3" : "rounded-xl p-1.5"}`}
                    style={{ width: menuWidth ?? (wide ? 248 : 196), zoom: menuZoom, background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }}
                    align="center"
                    sideOffset={8 * menuZoom}
                    collisionPadding={12}
                    updatePositionStrategy="always"
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                >
                    {children(() => setOpen(false))}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

function VideoCapsuleSlider({
    title,
    valueLabel,
    preview,
    min,
    max,
    value,
    ariaLabel,
    stops,
    onChange,
}: {
    title: string;
    valueLabel: string;
    preview?: ReactNode;
    min: number;
    max: number;
    value: number;
    ariaLabel: string;
    stops: Array<{ value: number; label: string }>;
    onChange: (value: number) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const span = Math.max(1, max - min);
    const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
    return (
        <div className="space-y-2.5 p-1.5">
            <div className="flex items-center justify-between text-xs">
                <span style={{ color: theme.node.muted }}>{title}</span>
                <span className="inline-flex items-center gap-1.5 font-mono font-semibold" style={{ color: theme.accent.base }}>
                    {preview}
                    <span>{valueLabel}</span>
                </span>
            </div>
            <div className="relative h-8 w-full overflow-hidden rounded-xl border" style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }}>
                <div
                    className="pointer-events-none absolute inset-y-0 left-0 rounded-r-lg transition-[width] duration-75"
                    style={{ width: `max(18px, ${pct}%)`, background: theme.accent.soft }}
                >
                    <span className="absolute right-1.5 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full shadow-xs" style={{ background: theme.accent.base }} />
                </div>
                <input
                    type="range"
                    aria-label={ariaLabel}
                    min={min}
                    max={max}
                    step={1}
                    value={value}
                    className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                    onChange={(event) => onChange(Number(event.target.value))}
                />
            </div>
            <div className="flex items-center justify-between gap-1 font-mono text-[10px]">
                {stops.map((stop) => {
                    const active = stop.value === value;
                    return (
                        <button
                            key={stop.value}
                            type="button"
                            className="rounded px-1 py-0.5 transition hover:opacity-100"
                            style={{ color: active ? theme.accent.base : theme.node.muted, fontWeight: active ? 700 : 500 }}
                            onClick={() => onChange(stop.value)}
                        >
                            {stop.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
