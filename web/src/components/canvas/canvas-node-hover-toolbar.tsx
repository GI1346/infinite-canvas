import { useAddImagesToHarness } from "@/services/api/deepseek-harness";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Modal, Popover, Segmented, Tooltip } from "antd";
import { Check, Palette, Scan, Download, FolderPlus, Image as ImageIcon, Info, MessageSquare, Minus, Music2, Plus, RefreshCw, Settings2, Trash2, Ungroup, Upload, Video, Sparkles, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { formatBytes, getDataUrlByteSize } from "@/lib/image-utils";
import { useCopyText } from "@/hooks/use-copy-text";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";
import type { CanvasNodeToolbarItem } from "@/types/canvas-plugin";
import { buildImageToolbarTools } from "./canvas-image-toolbar-tools";

type CanvasNodeHoverToolbarProps = {
    node: CanvasNodeData | null;
    viewport: ViewportTransform;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    onInfo: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onPaint: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onExtractSelection: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onSuperResolve: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onColor: (node: CanvasNodeData) => void;
    onPortrait: (node: CanvasNodeData) => void;
    onExpression: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
    onUngroup?: (node: CanvasNodeData) => void;
    onBatchDownload?: (node: CanvasNodeData) => void;
    batchDownloading?: boolean;
    extraTools?: CanvasNodeToolbarItem[];
};

type ToolbarTool = {
    id: string;
    title: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
};

export function CanvasNodeHoverToolbar({
    node,
    viewport,
    onKeep,
    onLeave,
    onInfo,
    onDecreaseFont,
    onIncreaseFont,
    onToggleDialog,
    onGenerateImage,
    onUpload,
    onDownload,
    onSaveAsset,
    onPaint,
    onMaskEdit,
    onCrop,
    onExtractSelection,
    onSplit,
    onUpscale,
    onSuperResolve,
    onAngle,
    onColor,
    onPortrait,
    onExpression,
    onViewImage,
    onReversePrompt,
    onRetry,
    onToggleFreeResize,
    onDelete,
    onUngroup,
    onBatchDownload,
    batchDownloading = false,
    extraTools = [],
}: CanvasNodeHoverToolbarProps) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const copyText = useCopyText();
    const addToHarness = useAddImagesToHarness();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    if (!node) return null;

    const left = viewport.x + (node.position.x + node.width / 2) * viewport.k;
    const top = viewport.y + node.position.y * viewport.k - (node.type === CanvasNodeType.Image ? 44 : 28) * viewport.k - 8;
    const isImage = node.type === CanvasNodeType.Image;
    const isVideo = node.type === CanvasNodeType.Video;
    const isAudio = node.type === CanvasNodeType.Audio;
    const hasImage = isImage && Boolean(node.metadata?.content);
    const hasVideo = isVideo && Boolean(node.metadata?.content);
    const hasAudio = isAudio && Boolean(node.metadata?.content);
    const isText = node.type === CanvasNodeType.Text;
    const isConfig = node.type === CanvasNodeType.Config;
    const canRetry = node.metadata?.status === "error" && !(isVideo && Boolean(node.metadata?.videoTaskId) && !hasVideo);
    const canQueryVideoTask = isVideo && Boolean(node.metadata?.videoTaskId) && !hasVideo && node.metadata?.status !== "loading";
    const copyImagePrompt = (target: CanvasNodeData) => {
        const prompt = target.metadata?.prompt?.trim();
        if (!prompt) {
            message.warning(t("canvas.nodeToolbar.noPrompt"));
            return;
        }
        copyText(prompt, t("common.promptCopied"));
    };
    const imageTools = buildImageToolbarTools(node, { onUpload, onToggleFreeResize, onPaint, onMaskEdit, onCrop, onSplit, onUpscale, onSuperResolve, onAngle, onColor, onPortrait, onExpression, onViewImage, onCopyPrompt: copyImagePrompt, onReversePrompt });

    const baseToolbarTools: ToolbarTool[] = [
        ...(isImage || isText || node.type === CanvasNodeType.Group ? [{ id: "addToHarness", title: "添加到 Harness", label: "添加到 Harness", icon: <img src="/icons/deepseek.svg" alt="" className="size-4" />, onClick: () => addToHarness([node.id]) }] : []),
        { id: "info", title: t("canvas.nodeToolbar.infoTitle"), label: t("canvas.nodeToolbar.info"), icon: <Info className="size-4" />, onClick: () => onInfo(node) },
        ...(node.type === CanvasNodeType.Group && onUngroup ? [{ id: "ungroup", title: t("canvas.nodeToolbar.ungroupTitle"), label: t("canvas.nodeToolbar.ungroup"), icon: <Ungroup className="size-4" />, onClick: () => onUngroup(node) }] : []),
        ...(node.type === CanvasNodeType.Group && onBatchDownload ? [{ id: "batchDownload", title: "批量下载图片（选择目录）", label: batchDownloading ? "打包中…" : "批量下载", icon: <Download className="size-4" />, onClick: () => onBatchDownload(node), disabled: batchDownloading }] : []),
        { id: "delete", title: t("canvas.nodeToolbar.removeTitle"), label: t("common.delete"), icon: <Trash2 className="size-4" />, onClick: () => onDelete(node), danger: true },
    ];
    const nodeToolbarTools: ToolbarTool[] = [
        ...(canQueryVideoTask ? [{ id: "queryVideoTask", title: t("canvas.nodeToolbar.queryVideoTaskTitle"), label: t("canvas.nodeToolbar.queryVideoTask"), icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        ...(canRetry ? [{ id: "retry", title: t("canvas.nodeToolbar.retryTitle"), label: t("canvas.node.retry"), icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        ...(hasImage || hasVideo || isText ? [{ id: "saveAsset", title: t("common.addToAssets"), label: t("canvas.nodeToolbar.saveAsset"), icon: <FolderPlus className="size-4" />, onClick: () => onSaveAsset(node) }] : []),
        ...(hasImage || hasVideo || hasAudio ? [{ id: "download", title: t(hasAudio ? "canvas.nodeToolbar.downloadAudio" : hasVideo ? "canvas.nodeToolbar.downloadVideo" : "canvas.nodeToolbar.downloadImage"), label: t("common.download"), icon: <Download className="size-4" />, onClick: () => onDownload(node) }] : []),
        ...(isVideo ? [{ id: "edit", title: t("common.edit"), label: t("common.edit"), icon: <MessageSquare className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText ? [{ id: "generateImage", title: t("canvas.node.generateImage"), label: t("canvas.node.generate"), icon: <ImageIcon className="size-4" />, onClick: () => onGenerateImage(node) }] : []),
        ...(isConfig ? [{ id: "config", title: t("canvas.configNode.title"), label: t("canvas.configNode.title"), icon: <Settings2 className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText ? [{ id: "decreaseFont", title: t("canvas.nodeToolbar.decreaseFont"), label: t("canvas.nodeToolbar.zoomOut"), icon: <Minus className="size-4" />, onClick: () => onDecreaseFont(node) }] : []),
        ...(isText ? [{ id: "increaseFont", title: t("canvas.nodeToolbar.increaseFont"), label: t("canvas.nodeToolbar.zoomIn"), icon: <Plus className="size-4" />, onClick: () => onIncreaseFont(node) }] : []),
        ...(isImage && !hasImage ? [{ id: "uploadImage", title: t("canvas.nodeToolbar.uploadImage"), label: t("canvas.nodeToolbar.uploadImage"), icon: <Upload className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isVideo ? [{ id: "uploadVideo", title: t(hasVideo ? "canvas.nodeToolbar.replaceVideo" : "canvas.nodeToolbar.uploadVideo"), label: t(hasVideo ? "canvas.nodeToolbar.replaceVideo" : "canvas.nodeToolbar.uploadVideo"), icon: <Video className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isAudio ? [{ id: "uploadAudio", title: t(hasAudio ? "canvas.nodeToolbar.replaceAudio" : "canvas.nodeToolbar.uploadAudio"), label: t(hasAudio ? "canvas.nodeToolbar.replaceAudio" : "canvas.nodeToolbar.uploadAudio"), icon: <Music2 className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(hasImage ? imageTools.map((tool) => ({ id: tool.id, title: tool.title, label: tool.label, icon: tool.icon, active: tool.active, onClick: tool.onClick })) : []),
    ];
    const pinnedIds = ["paint", "crop", "split", "color", "portrait", "expression"];
    const pinnedTools = imageTools.filter((tool) => pinnedIds.includes(tool.id)).sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
    const toolbarTools = hasImage ? [
        ...pinnedTools,
        { id: "extract", title: "提取选区", label: "提取选区", icon: <Scan className="size-4" />, onClick: () => onExtractSelection(node) },
        ...baseToolbarTools.filter((tool) => tool.id === "addToHarness"),
        ...extraTools,
        ...[...baseToolbarTools, ...nodeToolbarTools].filter((tool) => ["delete", "saveAsset", "download"].includes(tool.id)),
    ] : [...baseToolbarTools, ...nodeToolbarTools, ...extraTools];
    // 单行三段：图片编辑 / AI 协同 / 资产操作；调色、人像质感、表情调节三个低频滤镜收进「调色与人像」子菜单。
    const imageEditIds = ["paint", "crop", "split", "extract"];
    const refineIds = ["color", "portrait", "expression"];
    const aiIds = ["addToHarness"];
    const imageEditTools = toolbarTools.filter((tool) => imageEditIds.includes(tool.id));
    const refineTools = toolbarTools.filter((tool) => refineIds.includes(tool.id));
    const aiTools = toolbarTools.filter((tool) => aiIds.includes(tool.id));
    const assetTools = toolbarTools.filter((tool) => !imageEditIds.includes(tool.id) && !refineIds.includes(tool.id) && !aiIds.includes(tool.id));
    return (
        <>
            <div
                className="bf-canvas-glass absolute z-[70] flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-2xl p-1.5 text-[13px] shadow-lg"
                data-node-toolbar={node.id}
                style={{ left, top, maxWidth: "calc(100% - 24px)", boxShadow: theme.toolbar.shadow, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onMouseEnter={() => onKeep(node.id)}
                onMouseLeave={onLeave}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {imageEditTools.length || refineTools.length ? (
                    <div className="flex items-center gap-0.5 rounded-xl bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                        {imageEditTools.map((tool) => (
                            <ToolbarAction key={tool.id} {...tool} showLabel />
                        ))}
                        {refineTools.length ? (
                            <Popover
                                trigger="hover"
                                placement="top"
                                content={
                                    <div className="flex items-center gap-0.5">
                                        {refineTools.map((tool) => (
                                            <ToolbarAction key={tool.id} {...tool} showLabel />
                                        ))}
                                    </div>
                                }
                            >
                                <button type="button" aria-label="调色与人像" title="调色与人像" className="flex h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[13px] transition hover:bg-black/5 dark:hover:bg-white/10">
                                    <Sparkles className="size-4" />
                                    <span>调色与人像</span>
                                    <ChevronDown className="size-3 opacity-60" />
                                </button>
                            </Popover>
                        ) : null}
                    </div>
                ) : null}
                {aiTools.length ? (
                    <div className="flex items-center gap-0.5 rounded-xl bg-[#0ea977]/10 p-0.5 text-[#0ea977] dark:bg-[#37d39b]/12 dark:text-[#37d39b]">
                        {aiTools.map((tool) => (
                            <ToolbarAction key={tool.id} {...tool} showLabel />
                        ))}
                    </div>
                ) : null}
                {assetTools.length ? (
                    <div className="flex items-center gap-0.5 rounded-xl bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                        {assetTools.map((tool) => (
                            <ToolbarAction key={tool.id} {...tool} showLabel />
                        ))}
                    </div>
                ) : null}
            </div>
        </>
    );
}

export function CanvasNodeInfoModal({ node, open, onClose }: { node: CanvasNodeData | null; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const [view, setView] = useState<"info" | "json">("info");
    const imageBytes = node?.type === CanvasNodeType.Image && node.metadata?.content ? getDataUrlByteSize(node.metadata.content) : 0;
    const batchCount = node?.type === CanvasNodeType.Image ? node.metadata?.images?.length || 0 : 0;
    const json = useMemo(() => {
        if (!node) return "";
        return JSON.stringify(
            node,
            (key, value) => {
                if (key === "content" && typeof value === "string" && value.startsWith("data:image/")) {
                    return "[base64 image]";
                }
                return value;
            },
            2,
        );
    }, [node]);

    useEffect(() => {
        if (open) setView("info");
    }, [node?.id, open]);

    const title = (
        <div className="flex items-center justify-between gap-4 pr-12">
            <span>{t("canvas.nodeToolbar.nodeInfo")}</span>
            <Segmented
                size="small"
                value={view}
                onChange={(value) => setView(value as "info" | "json")}
                options={[
                    { label: t("canvas.nodeToolbar.info"), value: "info" },
                    { label: "JSON", value: "json" },
                ]}
            />
        </div>
    );

    return (
        <Modal className="canvas-node-info-modal" title={title} open={open && Boolean(node)} centered footer={null} onCancel={onClose}>
            {node ? (
                <div className="h-[56vh] min-h-[360px] select-text text-sm" data-canvas-shortcuts-ignore>
                    {view === "info" ? (
                        <div className="thin-scrollbar h-full space-y-3 overflow-auto pr-1">
                            <InfoRow label="ID" value={node.id} />
                            <InfoRow label={t("canvas.nodeToolbar.name")} value={node.title || t("canvas.node.untitled")} />
                            <InfoRow label={t("canvas.nodeToolbar.type")} value={node.type === CanvasNodeType.Group ? t("canvas.node.group") : node.type === CanvasNodeType.Config ? t("canvas.configNode.title") : [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio, CanvasNodeType.Text].includes(node.type as CanvasNodeType) ? t(`assets.kinds.${node.type}`) : getNodeDefinition(node.type)?.title || node.type} />
                            <InfoRow label={t("canvas.nodeToolbar.size")} value={`${Math.round(node.width)} x ${Math.round(node.height)}`} />
                            <InfoRow label={t("canvas.nodeToolbar.position")} value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
                            <InfoRow label={t("canvas.nodeToolbar.status")} value={node.metadata?.status || "idle"} />
                            {batchCount > 1 ? <InfoRow label={t("canvas.nodeToolbar.imageGroup")} value={t("canvas.configNode.images", { count: batchCount })} /> : null}
                            {node.metadata?.prompt ? <InfoRow label={t("canvas.configNode.prompt")} value={node.metadata.prompt} /> : null}
                            {node.metadata?.videoTaskId ? <InfoRow label={t("canvas.nodeToolbar.videoTaskId")} value={node.metadata.videoTaskId} /> : null}
                            {imageBytes ? <InfoRow label={t("canvas.nodeToolbar.imageSize")} value={formatBytes(imageBytes)} /> : null}
                            {node.metadata?.errorDetails ? (
                                <div className="rounded-lg border p-3 text-red-400" style={{ borderColor: theme.node.stroke }}>
                                    {node.metadata.errorDetails}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <pre className="thin-scrollbar h-full overflow-auto rounded-lg border p-3 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
                            {json}
                        </pre>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

function ToolbarAction({ title, label, icon, onClick, showLabel, active = false, danger = false, disabled }: ToolbarTool & { showLabel: boolean }) {
    const hasText = showLabel && Boolean(label);
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2} color="#ffffff" styles={{ root: { color: "#242529", boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
            <button type="button" className={`group relative flex h-8 items-center whitespace-nowrap px-0.5 disabled:opacity-40 ${danger ? "text-[#ef4444]" : ""}`} onClick={onClick} aria-label={title} disabled={disabled}>
                <span className={`flex h-7 items-center ${hasText ? "gap-1.5 px-2" : "justify-center px-1.5"} rounded-lg transition group-hover:bg-black/5 dark:group-hover:bg-white/10 ${active ? "bg-black/5 dark:bg-white/10" : ""}`}>
                    {icon}
                    {hasText ? <span>{label}</span> : null}
                </span>
            </button>
        </Tooltip>
    );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="opacity-50">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
        </div>
    );
}

const groupColors = [
    { label: "默认灰", value: undefined }, { label: "绿色", value: "#84cc16" }, { label: "青绿", value: "#10b981" },
    { label: "青色", value: "#06b6d4" }, { label: "蓝色", value: "#3b82f6" }, { label: "紫色", value: "#8b5cf6" },
    { label: "黄色", value: "#f59e0b" }, { label: "橙色", value: "#f97316" }, { label: "红色", value: "#f43f5e" },
];

export function CanvasGroupColorToolbar({ node, viewport, onColorChange }: { node: CanvasNodeData; viewport: ViewportTransform; onColorChange: (color: string | undefined) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false); };
        window.addEventListener("pointerdown", close, true);
        return () => window.removeEventListener("pointerdown", close, true);
    }, [open]);
    return (
        <div ref={ref} data-group-color-toolbar={node.id} data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore className="absolute z-[75] flex -translate-x-1/2 flex-col items-center gap-2"
            style={{ left: viewport.x + (node.position.x + node.width / 2) * viewport.k, top: viewport.y + (node.position.y + node.height) * viewport.k + 12, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setOpen(false); }} onWheel={(event) => event.stopPropagation()}>
            <button type="button" aria-label="分组颜色" aria-expanded={open} title="设置分组颜色" className="flex size-9 items-center justify-center rounded-xl border" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, boxShadow: theme.toolbar.shadow }} onClick={() => setOpen((value) => !value)}><Palette size={18} /><span className="ml-0.5 size-1.5 rounded-full" style={{ background: node.metadata?.groupColor || theme.node.muted }} /></button>
            {open && <div role="group" aria-label="选择分组颜色" className="grid grid-cols-3 gap-2 rounded-xl border p-2" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, boxShadow: theme.toolbar.shadow }}>
                {groupColors.map((color) => <button key={color.label} type="button" aria-label={color.label} aria-pressed={node.metadata?.groupColor === color.value} title={color.label} className="grid size-7 place-items-center rounded-lg border" style={{ background: color.value || theme.node.muted, borderColor: theme.toolbar.border, color: theme.node.panel, outline: node.metadata?.groupColor === color.value ? "2px solid " + theme.node.text : undefined, outlineOffset: 2 }} onClick={() => onColorChange(color.value)}>{node.metadata?.groupColor === color.value && <Check size={18} />}</button>)}
            </div>}
        </div>
    );
}