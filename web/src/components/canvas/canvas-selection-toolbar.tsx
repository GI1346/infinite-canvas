import { useAddImagesToHarness } from "@/services/api/deepseek-harness";
import type { MouseEventHandler, PointerEvent, ReactNode, Ref } from "react";
import { BookmarkPlus, Columns3, Download, Grid2X2, Group, PackagePlus, Plus, Rows3, Ungroup, Workflow } from "lucide-react";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { nodeBounds } from "@/lib/canvas/canvas-node-geometry";
import type { SelectionLayout } from "@/lib/canvas/canvas-selection-layout";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";

export const SELECTION_PAD = 14;
export function CanvasSelectionToolbar({
    nodes, viewport, showToolbar, boundsRef, wireSources, onStartBatchWire, canGroup, canUngroup, onGroup, onUngroup, onArrange, onSaveAssets, onSaveToResources, onDownload, downloading = false,
}: {
    nodes: CanvasNodeData[]; viewport: ViewportTransform; showToolbar: boolean;
    boundsRef?: Ref<HTMLDivElement>; wireSources?: number; onStartBatchWire?: (event: PointerEvent<HTMLButtonElement>) => void;
    canGroup: boolean; canUngroup: boolean; onGroup: () => void; onUngroup: () => void;
    onArrange: (mode: SelectionLayout) => void; onSaveAssets: () => void; onSaveToResources: () => void;
    onDownload?: () => void; downloading?: boolean;
}) {
    const { t } = useTranslation();
    const addToHarness = useAddImagesToHarness();
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    if (nodes.length < 2) return null;
    const arrange = (mode: SelectionLayout): MouseEventHandler<HTMLButtonElement> => (event) => {
        onArrange(mode);
        event.currentTarget.blur();
    };
    const bounds = nodeBounds(nodes), left = viewport.x + bounds.left * viewport.k - SELECTION_PAD, top = viewport.y + bounds.top * viewport.k - SELECTION_PAD;
    const width = (bounds.right - bounds.left) * viewport.k + SELECTION_PAD * 2, height = (bounds.bottom - bounds.top) * viewport.k + SELECTION_PAD * 2;
    return <>
        <div ref={boundsRef} data-selection-bounds className="pointer-events-none absolute z-[65]" style={{ left, top, width, height }}>
            <svg className="absolute inset-0 overflow-visible" width="100%" height="100%">
                <rect x={1} y={1} width={Math.max(width - 2, 0)} height={Math.max(height - 2, 0)} rx={16} ry={16} fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="7 5" strokeLinecap="round" />
            </svg>
            {showToolbar && (wireSources ?? 0) >= 2 && <button type="button" aria-label={`批量拉线（${wireSources} 个节点）`} title="按住拖动以批量连线" data-canvas-overlay data-canvas-no-zoom data-batch-wire-handle
                className="pointer-events-auto absolute -right-4 top-1/2 grid size-8 -translate-y-1/2 touch-none cursor-crosshair place-items-center rounded-full border shadow-sm transition hover:scale-110 hover:!bg-[#0ea977] hover:!text-white dark:hover:!bg-[#37d39b]" style={{ borderColor: theme.accent.base, background: theme.node.panel, color: theme.accent.base }}
                onPointerDown={onStartBatchWire} onMouseDown={(event) => event.stopPropagation()}>
                <Plus className="size-4" /><span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-0.5 font-mono text-[10px]" style={{ background: theme.accent.base, color: theme.node.panel }}>{wireSources}</span>
            </button>}
        </div>
        {showToolbar && <div data-canvas-overlay data-canvas-no-zoom data-selection-toolbar className="bf-canvas-glass absolute bottom-[calc(var(--canvas-quick-dock-height,0px)+24px)] left-1/2 z-[59] flex max-w-[calc(100%_-_32px)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-2xl border px-2.5 py-1.5 text-xs" style={{ ...canvasGlass(theme), color: theme.node.text }}
            onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
            <span className="shrink-0 whitespace-nowrap rounded-lg px-2 py-1 font-mono text-[11px] font-semibold" style={{ background: theme.accent.soft, color: theme.accent.base }}>已选 {nodes.length} 项</span>
            <div className="flex shrink-0 items-center gap-0.5 rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                <SelectionAction title="宫格排列" icon={<Grid2X2 className="size-3.5" />} onClick={arrange("grid")} />
                <SelectionAction title="水平排列" icon={<Columns3 className="size-3.5" />} onClick={arrange("row")} />
                <SelectionAction title="垂直排列" icon={<Rows3 className="size-3.5" />} onClick={arrange("column")} />
                <SelectionAction title="流程整理" icon={<Workflow className="size-3.5" />} disabled={!nodes.some(node => node.type === CanvasNodeType.Config)} onClick={arrange("flow")} />
            </div>
            <span className="mx-0.5 h-4 shrink-0 border-l" style={{ borderColor: theme.glass.insetBorder }} />
            <SelectionAction title="添加到 Harness" icon={<img src="/icons/deepseek.svg" alt="" className="size-3.5" />} onClick={() => addToHarness(nodes.map(node => node.id))} />
            {onDownload && nodes.some(node => node.type === "image" || node.type === "group") && <SelectionAction title={downloading ? "打包中…" : "导出图片"} icon={<Download className="size-3.5" />} onClick={onDownload} disabled={downloading} />}
            {canGroup && <SelectionAction title={t("canvas.nodeToolbar.groupTitle")} label={t("canvas.nodeToolbar.group")} icon={<Group className="size-3.5" />} onClick={onGroup} />}
            {canUngroup && <SelectionAction title={t("canvas.nodeToolbar.ungroupTitle")} label={t("canvas.nodeToolbar.ungroup")} icon={<Ungroup className="size-3.5" />} onClick={onUngroup} />}
            <span className="mx-0.5 h-4 shrink-0 border-l" style={{ borderColor: theme.glass.insetBorder }} />
            <SelectionAction title="存资产" label="存图片库" icon={<BookmarkPlus className="size-3.5" />} onClick={onSaveAssets} />
            <SelectionAction title="保存到资源管理器" label="存为工作流" icon={<PackagePlus className="size-3.5" />} onClick={onSaveToResources} />
        </div>}
    </>;
}
function SelectionAction({ title, label, icon, onClick, disabled }: { title: string; label?: string; icon: ReactNode; onClick: MouseEventHandler<HTMLButtonElement>; disabled?: boolean }) {
    return <Tooltip title={title} placement="top" mouseEnterDelay={0.2}>
        <button type="button" className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10" onClick={onClick} aria-label={title} disabled={disabled}>{icon}{label && <span>{label}</span>}</button>
    </Tooltip>;
}
