import { useAddImagesToHarness } from "@/services/api/deepseek-harness";
import type { ReactNode } from "react";
import { Bot, Columns3, Download, FolderPlus, Grid2X2, Group, Rows3, Ungroup, Workflow } from "lucide-react";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { canvasThemes } from "@/lib/canvas-theme";
import { nodeBounds } from "@/lib/canvas/canvas-node-geometry";
import type { SelectionLayout } from "@/lib/canvas/canvas-selection-layout";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";

const SELECTION_PAD = 14;
export function CanvasSelectionToolbar({
    nodes, viewport, showToolbar, canGroup, canUngroup, onGroup, onUngroup, onArrange, onSaveToResources, onDownload, onAddToAgent, downloading = false,
}: {
    nodes: CanvasNodeData[]; viewport: ViewportTransform; showToolbar: boolean;
    canGroup: boolean; canUngroup: boolean; onGroup: () => void; onUngroup: () => void;
    onArrange: (mode: SelectionLayout) => void; onSaveToResources: () => void;
    onDownload?: () => void; onAddToAgent: () => void; downloading?: boolean;
}) {
    const { t } = useTranslation();
    const addToHarness = useAddImagesToHarness();
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    if (nodes.length < 2) return null;
    const bounds = nodeBounds(nodes), left = viewport.x + bounds.left * viewport.k - SELECTION_PAD, top = viewport.y + bounds.top * viewport.k - SELECTION_PAD;
    const width = (bounds.right - bounds.left) * viewport.k + SELECTION_PAD * 2, height = (bounds.bottom - bounds.top) * viewport.k + SELECTION_PAD * 2;
    return <>
        <svg className="pointer-events-none absolute z-[65] overflow-visible" style={{ left, top, width, height }}>
            <rect x={1} y={1} width={Math.max(width - 2, 0)} height={Math.max(height - 2, 0)} rx={16} ry={16} fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="7 5" strokeLinecap="round" />
        </svg>
        {showToolbar && <div data-canvas-overlay data-canvas-no-zoom data-selection-toolbar className="absolute bottom-6 left-1/2 z-[70] flex max-w-[calc(100%_-_32px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border px-3 py-2 text-sm shadow-lg" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
            <span className="shrink-0 whitespace-nowrap px-2">已选 {nodes.length} 项</span>
            <SelectionAction title="宫格排列" icon={<Grid2X2 className="size-4" />} onClick={() => onArrange("grid")} />
            <SelectionAction title="水平排列" icon={<Columns3 className="size-4" />} onClick={() => onArrange("row")} />
            <SelectionAction title="垂直排列" icon={<Rows3 className="size-4" />} onClick={() => onArrange("column")} />
            <SelectionAction title="流程整理" icon={<Workflow className="size-4" />} disabled={!nodes.some(node => node.type === CanvasNodeType.Config)} onClick={() => onArrange("flow")} />
            <span className="mx-1 h-5 shrink-0 border-l" style={{ borderColor: theme.toolbar.border }} />
            <SelectionAction title="添加到 Agent" icon={<Bot className="size-4" />} onClick={onAddToAgent} />
            <SelectionAction title="添加到 Harness" icon={<img src="/icons/deepseek.svg" alt="" className="size-4" />} onClick={() => addToHarness(nodes.map(node => node.id))} />
            {onDownload && nodes.some(node => node.type === "image" || node.type === "group") && <SelectionAction title={downloading ? "打包中…" : "导出图片"} icon={<Download className="size-4" />} onClick={onDownload} disabled={downloading} />}
            {canGroup && <SelectionAction title={t("canvas.nodeToolbar.groupTitle")} label={t("canvas.nodeToolbar.group")} icon={<Group className="size-4" />} onClick={onGroup} />}
            {canUngroup && <SelectionAction title={t("canvas.nodeToolbar.ungroupTitle")} label={t("canvas.nodeToolbar.ungroup")} icon={<Ungroup className="size-4" />} onClick={onUngroup} />}
            <SelectionAction title="保存到资源管理器" label="保存到资源管理器" icon={<FolderPlus className="size-4" />} onClick={onSaveToResources} />
        </div>}
    </>;
}
function SelectionAction({ title, label, icon, onClick, disabled }: { title: string; label?: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
    return <Tooltip title={title} placement="top" mouseEnterDelay={0.2}>
        <button type="button" className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2.5 transition hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10" onClick={onClick} aria-label={title} disabled={disabled}>{icon}{label && <span>{label}</span>}</button>
    </Tooltip>;
}
