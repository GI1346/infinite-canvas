import { useEffect, useState } from "react";
import { ArrowUp, LoaderCircle, Maximize2, Play, Square } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { buildGenerationConfig } from "@/lib/canvas/canvas-generation-helpers";
import { inferMediaScale } from "@/lib/media-size";
import { useCanvasImageSettingsStore } from "@/stores/canvas/use-canvas-image-settings-store";
import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";
import { buildCanvasResourceReferences, getGroupResourceNodes, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasGenerationEditorModal, GenerationReferenceHeader, composerInputSurface, expandedComposerInputSurface } from "./canvas-generation-editor-modal";
import { CanvasReferenceImagePicker } from "./canvas-reference-image-picker";
import type { GalleryImage } from "@/pages/gallery/gallery-data";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, fromExpanded?: boolean) => void;
    onAddImageReference?: (nodeId: string, image: GalleryImage) => Promise<unknown>;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    nodes: CanvasNodeData[];
    connectedNodes?: CanvasNodeData[];
    onDisconnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection?: (nodeId: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    modeOverride?: CanvasNodeGenerationMode; // Plugin nodes set their generation type through useBuiltinPanel.mode.
};

export function CanvasNodePromptPanel({ node, nodes, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], connectedNodes = [], onDisconnectReference, onStartReferenceSelection, onImageSettingsOpenChange, onAddImageReference, modeOverride }: CanvasNodePromptPanelProps) {
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = modeOverride ?? defaultMode(node.type);
    const config = buildGenerationConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    const [expanded, setExpanded] = useState(false);
    const [collapsed, setCollapsed] = useState(false), [exploring, setExploring] = useState(false);
    const mediaPanel = mode === "image" || mode === "video";
    const imageNumbers = new Map(mentionReferences.filter((item) => item.active && item.kind === "image").map(({ nodeId }, index) => [nodeId, index + 1]));
    const upstreamNodes = connectedNodes.flatMap((input) => input.type === CanvasNodeType.Group ? getGroupResourceNodes(input.id, nodes) : [input]);
    const canGenerate = Boolean(prompt.trim()) || (!modeOverride && buildCanvasResourceReferences(upstreamNodes).some((reference) => Boolean(reference.text?.trim())));

    // Restore prompts only when switching nodes; preserve the current input after generation on the same node.
    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (isEditingExistingContent) onConfigChange(node.id, { composerContent: value });
        else if (mediaPanel) onConfigChange(node.id, { composerContent: value });
        else onPromptChange(node.id, value);
    };

    const close = () => setExpanded(false);
    const selectReferences = () => { close(); onStartReferenceSelection?.(node.id); };
    const submit = (large = false) => {
        if (!canGenerate || isRunning) return;
        if (large && mediaPanel) close();
        onGenerate(node.id, mode, prompt.trim(), large && mediaPanel);
    };

    // 图片节点的模型 / 尺寸 / 质量 / 张数同样进入配置记忆，新建节点时沿用。
    const applyImageConfig = (patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => {
        useCanvasImageSettingsStore.getState().remember(patch);
        onConfigChange(node.id, patch);
    };

    const openExpandedEditor = () => {
        setExpanded(true);
    };


    const renderPanel = (large: boolean) => <div
            data-canvas-no-zoom data-config-video={mode === "video" || undefined} data-expanded={large || undefined} inert={mediaPanel && !large && expanded}
            className={`flex min-w-0 flex-col gap-2 border p-3 ${large ? "h-[min(72dvh,760px)] rounded-[20px]" : "rounded-2xl shadow-2xl backdrop-blur"}`}
            style={{ ...(large ? {} : { background: theme.toolbar.panel, boxShadow: theme.toolbar.shadow }), borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {mediaPanel && <GenerationReferenceHeader theme={theme} count={imageNumbers.size} expanded={large} collapsed={collapsed} onSelect={onStartReferenceSelection ? selectReferences : undefined} onAddImage={onAddImageReference ? (image) => onAddImageReference(node.id, image) : undefined} onExpand={openExpandedEditor} onCollapse={() => setCollapsed((previous) => !previous)} onClose={close} />}
            {(large || !collapsed) && <>
            {mediaPanel && imageNumbers.size > 0 && <CanvasNodeReferenceBar nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} imageNumbers={imageNumbers} onDisconnect={onDisconnectReference} onReorder={isRunning ? undefined : (referenceNodeOrder) => onConfigChange(node.id, { referenceNodeOrder })} />}
            <CanvasNodeReferenceBar nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onlyNonImages={mediaPanel} onDisconnect={onDisconnectReference} onReorder={isRunning ? undefined : (referenceNodeOrder) => onConfigChange(node.id, { referenceNodeOrder })} onStartSelection={mediaPanel ? undefined : onStartReferenceSelection} />
            <CanvasPromptChipInput
                value={prompt}
                references={mentionReferences}
                ariaLabel="生成配置提示词"
                onChange={updatePrompt}
                onSubmit={() => submit(large)} onEscape={large ? close : undefined} submitWithModifier={mediaPanel}
                containerClassName={large ? "min-h-0 flex-1" : undefined}
                className={`thin-scrollbar w-full cursor-text resize-none overflow-y-auto px-3 py-2 outline-none ${large ? "h-full min-h-0 text-base leading-7" : "h-40 text-sm leading-5"} ${large ? expandedComposerInputSurface : mediaPanel ? composerInputSurface : "rounded-xl"}`}
                style={{ color: theme.node.text, borderColor: mediaPanel ? theme.node.stroke : undefined }}
                placeholder={t(`canvas.promptPanel.${mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode}`)}
            />

            <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    {!mediaPanel && <Tooltip title={t("canvas.promptPanel.expandEditor")}>
                        <Button type="text" className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0" style={{ color: theme.node.text }} icon={<Maximize2 className="size-3.5" />} onClick={openExpandedEditor} aria-label={t("canvas.promptPanel.expandEditor")} />
                    </Tooltip>}
                    {mediaPanel && onAddImageReference && <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:opacity-75" style={{ background: theme.accent.soft, color: theme.toolbar.activeText }} onClick={() => setExploring(true)}>探索</button>}
                    {mode === "image" ? (
                        <>
                            <ModelPicker groupByChannel="list" menuZoom={large ? 1 : undefined} config={config} value={config.model} onChange={(model) => applyImageConfig({ model })} capability="image" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => applyImageConfig(key === "count" ? { count: Number(value) || 1 } : key === "size" ? { size: value, imageResolution: inferMediaScale(value) } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker groupByChannel="list" menuZoom={large ? 1 : undefined} config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="video" onMissingConfig={() => { if (large) close(); openConfigDialog(true); }} className="!h-8 !rounded-xl !text-xs max-w-[190px]" />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[220px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker groupByChannel config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <>
                            <ModelPicker groupByChannel config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasTextSettingsPopover config={config} count={node.metadata?.textCount || 1} onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })} onCountChange={(textCount) => onConfigChange(node.id, { textCount })} />
                        </>
                    )}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    style={mediaPanel && !isRunning ? { background: `linear-gradient(135deg, ${theme.accent.base}, #12896a)`, color: "white" } : undefined}
                    danger={isRunning}
                    disabled={!isRunning && !canGenerate}
                    onClick={() => (isRunning ? onStop(node.id) : submit(large))}
                    aria-label={t(isRunning ? "canvas.promptPanel.stopGeneration" : "canvas.promptPanel.generate")}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-4 animate-spin" />
                                <Square className="size-3.5 fill-current" />
                                <span className="text-xs font-medium">{t("canvas.promptPanel.stop")}</span>
                            </>
                        ) : (
                            mediaPanel ? <><Play size={13} /><span>生成</span></> : <ArrowUp className="size-4" />
                        )}
                    </span>
                </Button>
            </div>
            </>}
        </div>;
    return <>
        {renderPanel(false)}
        {mediaPanel ? <CanvasGenerationEditorModal open={expanded} onClose={close}>{renderPanel(true)}</CanvasGenerationEditorModal> :
            <Modal title={t("canvas.promptPanel.editorTitle")} open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden>
                <div data-canvas-no-zoom className="pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                    <CanvasNodeReferenceBar nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} onReorder={isRunning ? undefined : (referenceNodeOrder) => onConfigChange(node.id, { referenceNodeOrder })} onStartSelection={(nodeId) => { setExpanded(false); onStartReferenceSelection?.(nodeId); }} />
                    <CanvasPromptChipInput
                        value={prompt}
                        references={mentionReferences}
                        onChange={updatePrompt}
                        className="thin-scrollbar h-[52dvh] min-h-80 w-full cursor-text overflow-y-auto rounded-xl border p-4 text-[15px] leading-6 outline-none"
                        style={{ background: "transparent", borderColor: theme.toolbar.border, color: theme.node.text }}
                        placeholder={t(`canvas.promptPanel.${mode === "text" && hasTextContent ? "editText" : mode}`)}
                    />
                </div>
            </Modal>}
        {exploring && onAddImageReference && <CanvasReferenceImagePicker initialTab="all" onClose={() => setExploring(false)} onSelect={async (image) => { await onAddImageReference(node.id, image); setExploring(false); }} />}
    </>;
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoMode") return { videoMode: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
