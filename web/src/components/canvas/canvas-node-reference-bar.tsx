import { FileText, Image as ImageIcon, Music2, Plus, Puzzle, Video, X } from "lucide-react";
import { Popover } from "antd";
import { Popover as ReferencePopover } from "radix-ui";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { getGroupResourceNodes, orderReferenceNodes } from "@/lib/canvas/canvas-resource-references";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function CanvasNodeReferenceBar({ nodeId, nodes, connectedNodes, onDisconnect, onStartSelection, onReorder, fontSize, imageNumbers, onlyNonImages = false }: { nodeId: string; nodes: CanvasNodeData[]; connectedNodes: CanvasNodeData[]; onDisconnect?: (fromNodeId: string, toNodeId: string) => void; onStartSelection?: (nodeId: string) => void; onReorder?: (nodeIds: string[]) => void; fontSize?: number; imageNumbers?: ReadonlyMap<string, number>; onlyNonImages?: boolean }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [dragged, setDragged] = useState<string | null>(null);
    const references = orderReferenceNodes(connectedNodes.flatMap((sourceNode) => (sourceNode.type === CanvasNodeType.Group ? getGroupResourceNodes(sourceNode.id, nodes) : [sourceNode]).map((node) => ({ id: node.id, node, sourceNodeId: sourceNode.id }))), nodes.find((node) => node.id === nodeId)?.metadata?.referenceNodeOrder);
    const dropReference = (targetId: string) => {
        if (dragged && dragged !== targetId && onReorder) {
            const ids = [...new Set(references.map((reference) => reference.id))];
            const from = ids.indexOf(dragged), to = ids.indexOf(targetId);
            if (from >= 0 && to >= 0) {
                ids.splice(from, 1);
                ids.splice(to, 0, dragged);
                onReorder(ids);
            }
        }
        setDragged(null);
    };
    const filmstrip = imageNumbers !== undefined;
    const referenceById = filmstrip ? new Map(references.map((reference) => [reference.id, reference])) : null;
    const shown = filmstrip ? Array.from(imageNumbers.keys()).flatMap((id) => referenceById?.get(id) ?? []) : onlyNonImages ? references.filter(({ node }) => node.type !== CanvasNodeType.Image && getNodeDefinition(node.type)?.resource?.(node)?.kind !== "image") : references;
    if ((filmstrip || onlyNonImages) && !shown.length) return null;
    return (
        <div className={filmstrip ? "min-w-0" : "mb-1.5"}>
            {!filmstrip && <div className="mb-1 text-[11px] font-medium" style={{ color: theme.node.muted, fontSize, lineHeight: fontSize ? 1.5 : undefined }}>{t("canvas.references.title")}</div>}
            <div data-config-reference-filmstrip={filmstrip ? "" : undefined} data-node-scroll={filmstrip ? "" : undefined} data-canvas-no-zoom={filmstrip ? "" : undefined} className={filmstrip ? "thin-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain px-1 py-1" : "thin-scrollbar flex min-h-12 gap-1.5 overflow-x-auto pb-1"}>
                {shown.map(({ node, sourceNodeId }) => <div key={sourceNodeId + ":" + node.id} data-reference-node-id={node.id} draggable={Boolean(onReorder)} title={onReorder ? "拖动调整参考顺序" : undefined}
                    className="shrink-0" style={{ cursor: onReorder ? "grab" : undefined, opacity: dragged === node.id ? 0.5 : 1 }}
                    onDragStart={(event) => { event.stopPropagation(); if (!onReorder) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-blinkflow-reference", node.id); setDragged(node.id); }}
                    onDragOver={(event) => { if (dragged && onReorder) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; } }}
                    onDrop={(event) => { if (dragged && onReorder) { event.preventDefault(); event.stopPropagation(); dropReference(node.id); } }} onDragEnd={(event) => { event.stopPropagation(); setDragged(null); }}>
                    <ReferenceItem node={node} imageNumber={imageNumbers?.get(node.id)} onRemove={() => onDisconnect?.(sourceNodeId, nodeId)} />
                </div>)}
                {!filmstrip && onStartSelection && <button type="button" className="grid size-12 shrink-0 place-items-center rounded-lg border bg-transparent transition hover:opacity-70" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }} title={t("canvas.references.select")} onClick={() => onStartSelection?.(nodeId)}><Plus className="size-4" /></button>}
            </div>
        </div>
    );
}

function ReferenceItem({ node, onRemove, imageNumber }: { node: CanvasNodeData; imageNumber?: number; onRemove: () => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    const content = node.metadata?.content || resource?.url;
    const thumbnail = previewUrlFor(node.metadata?.storageKey) || content;
    const Icon = resource?.kind === "image" || node.type === CanvasNodeType.Image ? ImageIcon : resource?.kind === "video" || node.type === CanvasNodeType.Video ? Video : resource?.kind === "audio" || node.type === CanvasNodeType.Audio ? Music2 : resource?.kind === "text" || node.type === CanvasNodeType.Text ? FileText : Puzzle;
    const preview = <ReferencePreview node={node} content={content} />;
    const artwork = (resource?.kind === "image" || node.type === CanvasNodeType.Image) && thumbnail ? <img draggable={false} src={thumbnail} alt="" className="size-full object-cover" /> : (resource?.kind === "video" || node.type === CanvasNodeType.Video) && content ? <video src={content} className="size-full object-cover" muted /> : <Icon className="size-5 opacity-65" />;
    const remove = <button type="button" className="absolute right-0 top-0 grid size-4 place-items-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} aria-label={t("canvas.references.disconnect")} title={t("canvas.references.disconnect")} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(); }}><X className="size-3" /></button>;
    const frame = { background: theme.toolbar.activeBg, borderColor: theme.toolbar.border };
    if (imageNumber !== undefined) return <div className="group relative size-[52px] shrink-0 overflow-hidden rounded-xl border border-black/10 transition-colors hover:border-[#37d39b] motion-safe:transition motion-safe:hover:scale-105 dark:border-white/12 dark:hover:border-[#37d39b]" style={{ background: frame.background }}>
        <ReferencePopover.Root>
            <ReferencePopover.Trigger asChild><button type="button" aria-label={`预览图${imageNumber} ${node.title}`} className="grid size-full place-items-center overflow-hidden rounded-[inherit]">{artwork}</button></ReferencePopover.Trigger>
            <ReferencePopover.Portal><ReferencePopover.Content data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore side="top" sideOffset={8} className="bf-spring-pop z-[1300] rounded-xl border p-2 shadow-xl" style={{ background: theme.node.panel, color: theme.node.text, borderColor: theme.node.stroke }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{preview}</ReferencePopover.Content></ReferencePopover.Portal>
        </ReferencePopover.Root>
        <span className="pointer-events-none absolute left-0 top-0 rounded-br-lg bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#37d39b] backdrop-blur-sm">图{imageNumber}</span>
        {remove}
    </div>;
    return <Popover placement="topLeft" mouseEnterDelay={0.15} content={<div data-canvas-overlay data-canvas-no-zoom>{preview}</div>}>
        <div className="group relative grid size-12 shrink-0 place-items-center rounded-lg border" style={frame}>
            <span className="grid size-full place-items-center overflow-hidden rounded-[inherit]">{artwork}</span>{remove}
        </div>
    </Popover>;
}

function ReferencePreview({ node, content }: { node: CanvasNodeData; content?: string }) {
    const { t } = useTranslation();
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    if ((resource?.kind === "image" || node.type === CanvasNodeType.Image) && content) return <img src={content} alt={node.title} className="max-h-52 w-72 rounded-lg object-contain" />;
    if ((resource?.kind === "video" || node.type === CanvasNodeType.Video) && content) return <video src={content} className="max-h-52 w-72 rounded-lg" muted controls />;
    if ((resource?.kind === "audio" || node.type === CanvasNodeType.Audio) && content) return <audio src={content} className="w-72" controls />;
    return <div className="max-h-52 w-72 overflow-auto whitespace-pre-wrap text-sm">{resource?.text || node.metadata?.content || node.metadata?.prompt || node.title || t("canvas.references.empty")}</div>;
}
