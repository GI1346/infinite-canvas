import { imageQualityForModel, imageQualityOptions } from "@/lib/image-quality";
import { isWorkflowNodeRunning, runWorkflowNode, stopWorkflowNode } from "@/lib/canvas/canvas-workflow-runner";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ArrowRight, ChevronDown, Download, Layers, Minus, Play, Plus, RotateCcw, Sparkles, Square, Table2, Upload, X, Zap } from "lucide-react";
import { Modal } from "antd";
import { TableCellImages } from "./dxos-table-cell-images";
import { useTableColumnImageDrag } from "./use-table-column-image-drag";
import { hydrateTableInputImages } from "@/lib/canvas/canvas-generation-helpers";
import { nanoid } from "nanoid";
import type { CanvasNodeContext, CanvasNodeDefinition } from "@/types/canvas-plugin";

import { stopWorkflowControlDrag } from "@/components/canvas/workflow-node-interactions";
import { TABLE_TYPE, CONCURRENT_TYPE, channelsFor, channelItems, inputTextAt, emptyTable, readTable, tableRowCount, tableInputColumn, generationRows, selectedGenerationRows, deleteTableRow, cellImageItems, type DxCellImages, type DxCellImageItem, type DxTable, type DxInputItem } from "@/lib/canvas/dxos-table";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";
import { workflowDisplayMetadata } from "@/lib/canvas/workflow-display-size";
import { resolveModelForCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { generationTaskKey, useGenerationRunnerStore } from "@/stores/canvas/use-generation-runner-store";
import { ensureImagePreview, getImagePreviewRevision, previewUrlFor, subscribeImagePreviews, uploadImage, resolveImageUrl } from "@/services/image-storage";

const ghostButton = "inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition hover:bg-black/[0.06] dark:hover:bg-white/[0.09] disabled:pointer-events-none disabled:opacity-40";
const iconButton = "inline-flex size-7 items-center justify-center rounded-lg transition hover:bg-black/[0.06] dark:hover:bg-white/[0.09] disabled:pointer-events-none disabled:opacity-35";
const primaryButton = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40";
const primaryGradient = "linear-gradient(135deg, #0ea977, #12896a)";
const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

const TASK_STATUS_STYLE = {
    queued: { label: "排队中", dot: "#9ca3af", bg: "rgba(156,163,175,0.14)", color: "#9ca3af" },
    running: { label: "运行中", dot: "#37d39b", bg: "rgba(55,211,155,0.16)", color: "#10b981" },
    interrupted: { label: "已中断", dot: "#f59e0b", bg: "rgba(245,158,11,0.14)", color: "#f59e0b" },
    success: { label: "已完成", dot: "#0ea977", bg: "rgba(14,169,119,0.14)", color: "#10b981" },
    error: { label: "失败", dot: "#ef4444", bg: "rgba(239,68,68,0.14)", color: "#ef4444" },
    stopped: { label: "已停止", dot: "#f59e0b", bg: "rgba(245,158,11,0.14)", color: "#f59e0b" },
} as const;
function useWorkflowGraph(ctx: CanvasNodeContext) {
    const current = useRef(ctx); current.current = ctx;
    const [graph, setGraph] = useState(() => ({ nodes: ctx.getNodes(), connections: ctx.getConnections() }));
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    useEffect(() => {
        const refresh = () => setGraph((previous) => {
            const nodes = current.current.getNodes(), connections = current.current.getConnections();
            return previous.nodes === nodes && previous.connections === connections ? previous : { nodes, connections };
        });
        const unsubscribe = ctx.on("canvas:graph-changed", refresh);
        refresh();
        return unsubscribe;
    }, [ctx]);
    return graph;
}
function useInputPreviews(items: DxInputItem[]) {
    const requested = useRef(new Set<string>());
    useEffect(() => { items.forEach((item) => {
        if (item.type !== "media" || item.mediaType !== "image" || !item.storageKey || requested.current.has(item.storageKey)) return;
        const key = item.storageKey; requested.current.add(key);
        void ensureImagePreview(key).catch(() => requested.current.delete(key));
    }); }, [items]);
}
function saveJson(value: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "table.json"; a.click(); URL.revokeObjectURL(url);
}

function TableContent({ ctx }: { ctx: CanvasNodeContext }) {
    const { node, theme } = ctx, table = readTable(node), channels = channelsFor(node);
    const [error, setError] = useState("");
    const [imagePreview, setImagePreview] = useState<{ url: string; title: string }>();
    const graph = useWorkflowGraph(ctx);
    const sources = useMemo(() => channelsFor(node).map((channel) => ({ channel, items: channelItems(node, channel.id, graph.nodes, graph.connections) })), [node, graph]);
    const previews = useMemo(() => [...sources.flatMap((source) => source.items), ...Object.entries(table.inputImages || {}).flatMap(([channelId, rows]) => Object.keys(rows).flatMap((row) => cellImageItems(table, channelId, Number(row), null)))], [sources, table]);
    useInputPreviews(previews);
    const count = tableRowCount(node, table, sources.map(({ items }) => items.length));
    const inputColumns = useMemo(() => sources.map(({ channel, items }) => tableInputColumn(table, channel, items, count)), [sources, table, count]);
    const sortableColumns = inputColumns.map(({ rows }) => rows.filter(({ orderSlots }) => orderSlots.length > 0).length > 1);
    const drag = useTableColumnImageDrag();
    const softBorder = theme.glass.insetBorder;
    const optionStyle: CSSProperties = { background: theme.node.panel, color: theme.node.text };
    const headCell: CSSProperties = { borderBottom: `1px solid ${theme.node.stroke}`, borderLeft: `1px solid ${softBorder}`, backgroundColor: theme.node.panel, backgroundImage: `linear-gradient(0deg, ${theme.glass.inset}, ${theme.glass.inset})`, color: theme.node.muted, minWidth: 184, padding: "8px 10px", textAlign: "left", verticalAlign: "middle" };
    const bodyCell: CSSProperties = { borderLeft: `1px solid ${softBorder}`, minWidth: 184, padding: "8px 10px", verticalAlign: "top" };
    const input: CSSProperties = { width: "100%", background: "transparent", color: theme.node.text, outline: "none", fontSize: "inherit", lineHeight: "inherit" };
    const editorSurface: CSSProperties = { background: theme.glass.inset, color: theme.node.text };
    const textCell = "flex h-full min-h-[84px] flex-col";
    const textEditor = "h-full w-full flex-1 resize-none overflow-y-auto overscroll-contain rounded-lg px-2 py-1.5 leading-relaxed outline-none ring-1 ring-transparent transition focus:ring-[#0ea977]/60 dark:focus:ring-[#37d39b]/60";
    const update = (value: DxTable) => ctx.updateMetadata({ table: value });
    const setCell = (row: number, col: number, text: string) => {
        const rows = Array.from({ length: Math.max(count, row + 1) }, (_, i) => [...(table.rows[i] || table.columns.map(() => ""))]);
        rows[row][col] = text; update({ ...table, rows });
    };
    const setInputText = (channelId: string, row: number, text: string) => update({ ...table, inputTexts: { ...table.inputTexts, [channelId]: { ...table.inputTexts?.[channelId], [row]: text } } });
    const updateImages = (current: DxTable, channelId: string, row: number, cell: DxCellImages) => update({
        ...current, inputImages: { ...current.inputImages, [channelId]: { ...current.inputImages?.[channelId], [row]: cell } },
    });
    const addCellImages = async (channelId: string, row: number, files: File[]) => {
        const project = ctx.getProjectId?.(), originalRows = table.rows;
        try {
            const added = [];
            for (const file of files) {
                if (!file.type.startsWith("image/")) continue;
                const image = await uploadImage(file);
                if (image.storageKey) added.push({ id: nanoid(), title: file.name, storageKey: image.storageKey, url: image.url });
            }
            const latest = ctx.getNode(node.id);
            if (!added.length || !latest || ctx.getProjectId?.() !== project || !channelsFor(latest).some((channel) => channel.id === channelId)) return;
            const current = readTable(latest);
            if (latest.metadata?.table && originalRows !== current.rows) { setError("表格行已修改，请重新添加图片"); return; }
            const previous = current.inputImages?.[channelId]?.[row];
            const nextCell = { ...previous, images: [...(previous?.images ?? []), ...added] };
            let inputOrderMap = current.inputOrderMap;
            if (inputOrderMap?.[channelId]) {
                // A deliberate upload into a specific cell stays there, even when the column has a saved order.
                const channel = channelsFor(latest).find(({ id }) => id === channelId)!;
                const items = channelItems(latest, channelId, ctx.getNodes(), ctx.getConnections());
                const rowCount = Math.max(count, row + 1);
                const ids = tableInputColumn(current, channel, items, rowCount).ids;
                const inputImages = { ...current.inputImages, [channelId]: { ...current.inputImages?.[channelId], [row]: nextCell } };
                const rawOrder = tableInputColumn({ ...current, inputOrderMap: undefined, inputImages }, channel, items, rowCount).ids;
                added.forEach(({ id }) => {
                    const imageId = "table-image:" + id, slot = rawOrder.indexOf(imageId);
                    if (slot >= 0) ids.splice(slot, 0, imageId);
                });
                inputOrderMap = { ...inputOrderMap, [channelId]: ids };
            }
            updateImages({ ...current, inputOrderMap }, channelId, row, nextCell);
            setError("");
        } catch (reason) { setError(reason instanceof Error ? reason.message : "无法添加图片"); }
    };
    const removeCellImage = (channelId: string, id: string) => {
        const latest = ctx.getNode(node.id);
        if (!latest) return;
        const current = readTable(latest), rows = current.inputImages?.[channelId];
        if (!rows) return;
        const source = Object.entries(rows).find(([, cell]) => cell.images.some((image) => image.id === id));
        if (!source) return;
        const [row, cell] = source, index = cell.images.findIndex((image) => image.id === id);
        const linkedIndex = cell.linkedIndex === undefined ? undefined : cell.linkedIndex - Number(index < cell.linkedIndex);
        const inputOrderMap = current.inputOrderMap?.[channelId] ? { ...current.inputOrderMap, [channelId]: current.inputOrderMap[channelId].filter((key) => key !== "table-image:" + id) } : current.inputOrderMap;
        updateImages({ ...current, inputOrderMap }, channelId, Number(row), { linkedIndex, images: cell.images.filter((image) => image.id !== id) });
    };
    const commitImageOrder = (channelId: string, shown: string[], ordered: string[]) => {
        const latest = ctx.getNode(node.id);
        if (!latest) return;
        const current = readTable(latest), channels = channelsFor(latest);
        const inputs = channels.map((channel) => channelItems(latest, channel.id, ctx.getNodes(), ctx.getConnections()));
        const index = channels.findIndex(({ id }) => id === channelId);
        if (index < 0) return;
        const ids = tableInputColumn(current, channels[index], inputs[index], tableRowCount(latest, current, inputs.map((items) => items.length))).ids;
        if (ids.length !== shown.length || ids.some((id, position) => id !== shown[position])) return;
        update({ ...current, inputOrderMap: { ...current.inputOrderMap, [channelId]: ordered } });
    };
    const previewImage = async (image: DxCellImageItem) => {
        try { setImagePreview({ url: await resolveImageUrl(image.storageKey, image.url), title: image.title }); }
        catch { setError("无法读取原图"); }
    };
    const importTable = async (file: File) => {
        try {
            const t = JSON.parse(await file.text()) as DxTable;
            if (t.kind !== "table" || t.version !== 1 || !Array.isArray(t.columns) || !t.columns.every((c) => typeof c === "string") || !Array.isArray(t.rows) || !t.rows.every((r) => Array.isArray(r) && r.length === t.columns.length && r.every((v) => typeof v === "string"))) throw new Error("需要 table/version 1 的列与字符串单元格数据");
            if (t.inputTexts && (typeof t.inputTexts !== "object" || Object.values(t.inputTexts).some((rows) => !rows || typeof rows !== "object" || Object.entries(rows).some(([row, value]) => !/^\d+$/.test(row) || typeof value !== "string")))) throw new Error("输入列需要有效的逐行文本数据");
            if (t.inputImages && (typeof t.inputImages !== "object" || Object.values(t.inputImages).some((cells) => !cells || typeof cells !== "object" || Object.entries(cells).some(([row, cell]) => !/^\d+$/.test(row) || !Array.isArray(cell?.images) || cell.images.some((image) => typeof image?.id !== "string" || typeof image.storageKey !== "string" || !image.storageKey.startsWith("image:") || typeof image.title !== "string" || typeof image.url !== "string") || (cell.linkedIndex !== undefined && (!Number.isInteger(cell.linkedIndex) || cell.linkedIndex < 0)))))) throw new Error("输入列需要有效的逐行图片数据");
            if (t.inputOrderMap && (typeof t.inputOrderMap !== "object" || Array.isArray(t.inputOrderMap) || Object.values(t.inputOrderMap).some((order) => !Array.isArray(order) || order.some((id) => typeof id !== "string")))) throw new Error("输入列需要有效的图片排序数据");
            update({ ...await hydrateTableInputImages(t), selectedRows: Array.isArray(t.selectedRows) ? t.selectedRows : [], mergedGroups: Array.isArray(t.mergedGroups) ? t.mergedGroups : [] }); setError("");
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    };
    const selectedCount = table.selectedRows.length;
    return <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden text-xs" style={{ background: theme.node.panel, color: theme.node.text }} onMouseDown={stopWorkflowControlDrag} onPointerDown={stop} onKeyDown={stop}>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: softBorder, background: theme.glass.inset }}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: theme.accent.soft, color: theme.accent.base }}><Table2 className="size-4" /></span>
            <div className="mr-auto flex min-w-0 cursor-grab items-center gap-1.5" data-node-drag-handle>
                <strong className="truncate text-xs font-semibold">多维表格</strong>
                <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px]" style={{ background: theme.glass.inset, color: theme.node.muted }}>{count} 行 · {channels.length} 输入</span>
                {selectedCount > 0 && <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ background: theme.accent.soft, color: theme.accent.base }}>已选 {selectedCount}</span>}
            </div>
            <button type="button" className={ghostButton} style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => ctx.updateMetadata({ tableInputChannels: [...channels, { id: `input-${nanoid()}` }] })}><Plus className="size-3.5" />输入</button>
            <button type="button" className={ghostButton} style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => update({ ...table, columns: [...table.columns, `字段 ${table.columns.length + 2}`], rows: table.rows.map((r) => [...r, ""]) })}><Plus className="size-3.5" />字段</button>
            <span className="mx-0.5 h-4 w-px shrink-0" style={{ background: theme.node.stroke }} />
            <button type="button" aria-label="导出" title="导出 JSON" className={iconButton} style={{ background: theme.glass.inset, color: theme.node.muted }} onClick={() => saveJson(table)}><Download className="size-3.5" /></button>
            <label aria-label="导入" title="导入 JSON" className={`${iconButton} cursor-pointer`} style={{ background: theme.glass.inset, color: theme.node.muted }}><Upload className="size-3.5" /><input type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importTable(f); e.target.value = ""; }} /></label>
        </div>
        <div data-node-scroll className="min-h-0 flex-1 overflow-auto overscroll-contain">
            <table ref={drag.tableRef} onPointerDownCapture={drag.resetClick} onClickCapture={drag.clickCapture} className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                    <tr>
                        <th className="sticky left-0 z-20 font-mono text-[11px] font-medium" style={{ ...headCell, borderLeft: "none", minWidth: 54, width: 54 }}>#</th>
                        {sources.map(({ channel, items }, index) => <th key={channel.id} style={headCell}>
                            <div className="flex items-center gap-1.5">
                                <span className="size-2 shrink-0 rounded-full" style={{ background: theme.accent.base }} />
                                <span className="shrink-0 font-semibold" style={{ color: theme.node.text }}>输入 {index + 1}</span>
                                <div className="relative inline-flex h-6 min-w-0 max-w-[116px] items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-none" style={{ background: theme.accent.soft, color: theme.accent.base }}>
                                    <span className="truncate">{channel.mode === "sequence" ? "逐行配对" : channel.mode === "shared" ? "共享末项" : `自动·${items.length > 1 ? "逐行" : "共享"}`}</span>
                                    <ChevronDown className="size-3 shrink-0 opacity-75" />
                                    <select aria-label={`输入 ${index + 1} 配对方式`} className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" value={channel.mode || "auto"} onChange={(e) => ctx.updateMetadata({ tableInputChannels: channels.map((c) => c.id === channel.id ? { ...c, mode: e.target.value === "auto" ? undefined : e.target.value as "sequence" | "shared" } : c) })}>
                                        <option style={optionStyle} value="auto">自动（{items.length > 1 ? "逐行" : "共享"}）</option>
                                        <option style={optionStyle} value="sequence">逐行配对</option>
                                        <option style={optionStyle} value="shared">共享 / 重复末项</option>
                                    </select>
                                </div>
                                <button type="button" title="移除输入及其连线" className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-md opacity-55 transition hover:opacity-100 disabled:pointer-events-none disabled:opacity-25" style={{ color: theme.node.muted }} disabled={channels.length === 1} onClick={() => { ctx.applyOps([{ type: "delete_connections", ids: ctx.getConnections().filter((c) => c.toNodeId === node.id && (c.toPort || channels[0].id) === channel.id).map((c) => c.id) }]); const inputImages = { ...table.inputImages }, inputOrderMap = { ...table.inputOrderMap }; delete inputImages[channel.id]; delete inputOrderMap[channel.id]; ctx.updateMetadata({ tableInputChannels: channels.filter((c) => c.id !== channel.id), table: { ...table, inputImages, inputOrderMap } }); }}><X className="size-3" /></button>
                            </div>
                        </th>)}
                        {table.columns.map((name, col) => <th key={col} style={headCell}>
                            <div className="flex items-center gap-1">
                                <input aria-label={`字段 ${col + 1} 名称`} className="min-w-0 flex-1 font-semibold" style={input} value={name} onChange={(e) => update({ ...table, columns: table.columns.map((c, i) => i === col ? e.target.value : c) })} />
                                <button type="button" title="删除字段" className="inline-flex size-5 shrink-0 items-center justify-center rounded-md opacity-45 transition hover:opacity-100" style={{ color: theme.node.muted }} onClick={() => update({ ...table, columns: table.columns.filter((_, i) => i !== col), rows: table.rows.map((r) => r.filter((_, i) => i !== col)) })}><X className="size-3" /></button>
                            </div>
                        </th>)}
                        <th style={{ ...headCell, minWidth: 38, width: 38, padding: "8px 4px" }} />
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: count }, (_, row) => {
                        const rowSelected = table.selectedRows.includes(row);
                        return <tr key={row} className="group/row transition-colors hover:bg-[#0ea977]/[0.035]" style={{ borderBottom: `1px solid ${softBorder}`, background: rowSelected ? theme.accent.soft : undefined }}>
                            <td className="sticky left-0 z-[5] align-top" style={{ minWidth: 54, width: 54, padding: "9px 10px", background: rowSelected ? theme.toolbar.activeBg : theme.node.panel }}>
                                <label className="flex cursor-pointer select-none items-center gap-1.5">
                                    <input aria-label={`选择第 ${row + 1} 行`} type="checkbox" className="size-3.5 shrink-0 cursor-pointer rounded accent-[#0ea977]" checked={rowSelected} onChange={(e) => update({ ...table, selectedRows: e.target.checked ? [...table.selectedRows, row] : table.selectedRows.filter((i) => i !== row) })} />
                                    <span className="font-mono text-[11px] font-medium" style={{ color: rowSelected ? theme.accent.base : theme.node.muted }}>{row + 1}</span>
                                </label>
                            </td>
                            {sources.map(({ channel }, column) => {
                                const { rows, ids } = inputColumns[column];
                                const { input: item, images, orderSlots } = rows[row];
                                const media = item?.type === "media" ? item : null;
                                const hasText = !media || table.inputTexts?.[channel.id]?.[row] !== undefined;
                                return <td key={channel.id} data-table-input-id={channel.id} data-table-row-index={row} data-table-order-slots={orderSlots.join(",")} className="relative h-px align-top" style={{ ...bodyCell, "--table-insertion-color": theme.accent.base } as CSSProperties}>
                                    <TableCellImages cellKey={`${node.id}:${row}:${channel.id}`} images={images} theme={theme} onPreview={previewImage} className={hasText ? textCell : undefined} onFiles={(files) => void addCellImages(channel.id, row, files)} onRemove={(id) => removeCellImage(channel.id, id)} onImagePointerDown={sortableColumns[column] ? (event, image) => drag.start(event, channel.id, row, ids, image.nodeId, (ordered) => commitImageOrder(channel.id, ids, ordered)) : undefined}>
                                        {media && media.mediaType !== "image" && <div className="mb-1 shrink-0 rounded-md px-2 py-0.5 text-[11px]" style={{ background: theme.glass.inset, color: theme.node.muted }}>{media.mediaType} · {media.title}</div>}
                                        {hasText && <textarea aria-label={`第 ${row + 1} 行输入 ${column + 1} 文本`} data-node-scroll className={`${textEditor} ${media || images.length ? "mt-1.5 min-h-[76px]" : "min-h-0"}`} style={editorSurface} value={inputTextAt(table, channel.id, row, item)} placeholder="连接图片组或文本到左侧端口，也可直接输入" onChange={(e) => setInputText(channel.id, row, e.target.value)} />}
                                    </TableCellImages>
                                </td>;
                            })}
                            {table.columns.map((_, col) => <td key={col} className="h-px align-top" style={bodyCell}>
                                <div className={textCell}>
                                    <textarea aria-label={`第 ${row + 1} 行第 ${col + 1} 字段`} data-node-scroll className={`${textEditor} min-h-0`} style={editorSurface} placeholder="输入内容或粘贴表格…" value={table.rows[row]?.[col] || ""} onChange={(e) => setCell(row, col, e.target.value)} onPaste={(e) => {
                                        const text = e.clipboardData.getData("text/plain"); if (!text.includes("\t")) return; e.preventDefault();
                                        const pasted = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((r) => r.split("\t"));
                                        const width = Math.max(table.columns.length, col + Math.max(...pasted.map((r) => r.length)));
                                        const columns = Array.from({ length: width }, (_, i) => table.columns[i] || `字段 ${i + 2}`);
                                        const rows = Array.from({ length: Math.max(count, row + pasted.length) }, (_, i) => columns.map((_, j) => table.rows[i]?.[j] || ""));
                                        pasted.forEach((r, i) => r.forEach((v, j) => { rows[row + i][col + j] = v; })); update({ ...table, columns, rows });
                                    }} />
                                </div>
                            </td>)}
                            <td className="align-top text-center" style={{ ...bodyCell, minWidth: 38, width: 38, padding: "8px 4px" }}>
                                <button type="button" title="删除数据行（连线输入由上游控制）" className="inline-flex size-6 items-center justify-center rounded-lg opacity-0 transition hover:bg-black/[0.06] group-hover/row:opacity-70 hover:!opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-20 dark:hover:bg-white/[0.08]" style={{ color: theme.node.muted }} disabled={row >= table.rows.length} onClick={() => update(deleteTableRow(table, row))}><X className="size-3.5" /></button>
                            </td>
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>
        {imagePreview && <Modal open centered footer={null} title={imagePreview.title} onCancel={() => setImagePreview(undefined)} modalRender={(modal) => <div data-table-image-preview data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore onPointerDown={stop} onMouseDown={stop}>{modal}</div>}><img src={imagePreview.url} alt={imagePreview.title} className="mx-auto max-h-[70vh] max-w-full object-contain" /></Modal>}
        {error && <p role="alert" className="mx-3 mt-1.5 rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] text-red-500">{error}</p>}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2" style={{ borderColor: softBorder, background: theme.glass.inset }}>
            <button type="button" className={ghostButton} style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => update({ ...table, rows: [...Array.from({ length: count }, (_, i) => table.rows[i] || table.columns.map(() => "")), table.columns.map(() => "")] })}><Plus className="size-3.5" />数据行</button>
            <button type="button" className={primaryButton} style={{ backgroundImage: primaryGradient }} onClick={() => {
                const id = nanoid(); ctx.applyOps([{ type: "add_node", id, nodeType: CONCURRENT_TYPE, title: "并发生成", position: { x: node.position.x + node.width + 100, y: node.position.y }, metadata: { tableBatchManualSelection: table.selectedRows.length > 0, tableBatchSelectedRows: table.selectedRows.map((i) => i + 1) } }, { type: "connect_nodes", fromNodeId: node.id, toNodeId: id }]);
            }}><span>连接并发节点{selectedCount > 0 ? `（同步 ${selectedCount} 行）` : ""}</span><ArrowRight className="size-3.5" /></button>
        </div>
    </div>;
}

function ConcurrentContent({ ctx }: { ctx: CanvasNodeContext }) {
    const config = useEffectiveConfig();
    const graph = useWorkflowGraph(ctx);
    const { node, theme } = ctx, meta = node.metadata || {};
    const rows = useMemo(() => generationRows(node, graph.nodes, graph.connections), [node, graph]);
    const previews = useMemo(() => rows.flatMap((row) => row.media), [rows]);
    useInputPreviews(previews);
    const model = resolveModelForCapability(config, meta.model, "image"), qualityOptions = imageQualityOptions(model), quality = imageQualityForModel(model, meta.quality || config.quality);
    const current = useRef(ctx); current.current = ctx;
    const controller = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    const [localRunning, setRunning] = useState(false), [error, setError] = useState("");
    const backgroundProjectId = meta.generationMode === "video" || meta.generationMode === "text" ? undefined : ctx.getProjectId?.();
    const backgroundRunning = useGenerationRunnerStore((state) => backgroundProjectId ? Boolean(state.tasks[generationTaskKey(backgroundProjectId, node.id)]) : false);
    const running = localRunning || backgroundRunning || (meta.status === "loading" && isWorkflowNodeRunning(node.id, backgroundProjectId));
    const selectRow = (rowNumber: number, checked?: boolean) => {
        const latest = current.current.node.metadata || {};
        if (running || !latest.tableBatchManualSelection) return;
        const selected = latest.tableBatchSelectedRows || [];
        current.current.updateMetadata({ tableBatchSelectedRows: (checked ?? !selected.includes(rowNumber)) ? [...new Set([...selected, rowNumber])] : selected.filter((number) => number !== rowNumber) });
    };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (!backgroundProjectId) controller.current?.abort(); }; }, [node.id, backgroundProjectId]);
    const size = meta.size || config.size;
    const softBorder = theme.glass.insetBorder;
    const optionStyle: CSSProperties = { background: theme.node.panel, color: theme.node.text };
    const concurrency = Math.max(1, meta.tableBatchConcurrency || 1);
    const startRow = Math.max(1, meta.tableBatchStartRow || 1);
    const manualSelection = Boolean(meta.tableBatchManualSelection);
    const activeRows = selectedGenerationRows(node, rows);
    const batchTasks = meta.tableBatchRun?.tasks || [];
    const doneCount = batchTasks.filter((task) => task.status === "success").length;
    const progressPercent = batchTasks.length ? Math.round((doneCount / batchTasks.length) * 100) : 0;
    const run = async (retry = false) => {
        if (controller.current || isWorkflowNodeRunning(node.id, backgroundProjectId)) return;
        const abort = new AbortController(); controller.current = abort; setRunning(true); setError("");
        try {
            await runWorkflowNode(node.id, { getNode: (id) => current.current.getNode(id), getNodes: () => current.current.getNodes(), getConnections: () => current.current.getConnections(), applyOps: (ops) => current.current.applyOps(ops), ai: current.current.ai, getConfig: () => config, isActive: () => mounted.current }, { signal: abort.signal, retry, projectId: backgroundProjectId });
        } catch (reason) { if (mounted.current && controller.current === abort && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { if (controller.current === abort) { controller.current = null; if (mounted.current) setRunning(false); } }
    };
    return <div className="flex h-full min-h-0 flex-col overflow-hidden text-xs" style={{ background: theme.node.panel, color: theme.node.text }} onMouseDown={stopWorkflowControlDrag} onPointerDown={stop} onKeyDown={stop}>
        <div className="h-[2px] w-full shrink-0" style={{ background: softBorder }}>
            <div className="h-full transition-all duration-300" style={{ width: `${running ? Math.max(15, progressPercent) : progressPercent}%`, background: theme.accent.base }} />
        </div>
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2" style={{ borderColor: softBorder, background: theme.glass.inset }}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: theme.accent.soft, color: theme.accent.base }}><Zap className="size-4" /></span>
            <div className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5" data-node-drag-handle>
                <strong className="truncate text-xs font-semibold">并发生成</strong>
                <span className="shrink-0 font-mono text-[11px]" style={{ color: theme.node.muted }}>· {rows.length} 行</span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold" style={{ background: theme.accent.soft, color: theme.accent.base }}>
                {running && <span className="size-1.5 animate-pulse rounded-full" style={{ background: theme.accent.base }} />}⚡ ×{concurrency}
            </span>
        </div>
        <div className="shrink-0 space-y-1.5 border-b px-3 py-2" style={{ borderColor: softBorder }}>
            {(() => {
                const models = ctx.ai.listModels("image");
                const selectedModelLabel = !meta.model ? "使用画布默认模型" : models.find((m) => m.value === meta.model)?.label || `缺失模型：${meta.model}`;
                const activeRatio = meta.imageAspectRatio || inferMediaRatio(size);
                const activeScale = meta.imageResolution || inferMediaScale(size);
                return <>
                    <div className="relative flex h-8 items-center gap-2 rounded-xl border px-2.5 transition-colors focus-within:border-[#0ea977] hover:border-[#0ea977]/50" style={{ borderColor: theme.node.stroke, background: theme.glass.inset, opacity: running ? 0.55 : 1 }}>
                        <span className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none" style={{ background: theme.accent.soft, color: theme.accent.base }}>AI</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium leading-none" style={{ color: theme.node.text }}>{selectedModelLabel}</span>
                        <ChevronDown className="size-3.5 shrink-0 opacity-55" style={{ color: theme.node.muted }} />
                        <select aria-label="模型与中转站" disabled={running} className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed" value={meta.model || ""} onChange={(e) => ctx.updateMetadata({ model: e.target.value || undefined, quality: imageQualityForModel(resolveModelForCapability(config, e.target.value, "image"), quality) })}>
                            <option style={optionStyle} value="">使用画布默认模型</option>
                            {meta.model && !models.some((m) => m.value === meta.model) && <option style={optionStyle} value={meta.model}>缺失模型：{meta.model}</option>}
                            {models.map((m) => <option style={optionStyle} key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-3 gap-1 rounded-xl p-1 text-[11px]" style={{ background: theme.glass.inset }}>
                        <div className="relative flex h-7 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 leading-none transition hover:brightness-110" style={{ background: theme.node.panel, opacity: running ? 0.5 : 1 }}>
                            <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>比例</span>
                            <span className="truncate font-mono font-semibold" style={{ color: theme.node.text }}>{activeRatio === "auto" ? "自动" : activeRatio}</span>
                            <ChevronDown className="size-3 shrink-0 opacity-50" style={{ color: theme.node.muted }} />
                            <select aria-label="生成比例" disabled={running} className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed" value={activeRatio} onChange={(e) => ctx.updateMetadata({ imageAspectRatio: e.target.value, imageResolution: activeScale, size: computeMediaSize(activeScale, e.target.value) })}>
                                {mediaRatioOptions.map((r) => <option style={optionStyle} key={r.value} value={r.value}>{r.value === "auto" ? "自动" : r.value}</option>)}
                            </select>
                        </div>
                        <div className="relative flex h-7 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 leading-none transition hover:brightness-110" style={{ background: theme.node.panel, opacity: running ? 0.5 : 1 }}>
                            <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>清晰</span>
                            <span className="truncate font-mono font-semibold" style={{ color: theme.node.text }}>{activeScale === "auto" ? "自动" : activeScale.toUpperCase()}</span>
                            <ChevronDown className="size-3 shrink-0 opacity-50" style={{ color: theme.node.muted }} />
                            <select aria-label="生成分辨率" disabled={running} className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed" value={activeScale} onChange={(e) => ctx.updateMetadata({ imageResolution: e.target.value, size: computeMediaSize(e.target.value, activeRatio) })}>
                                {mediaScaleOptions.map((r) => <option style={optionStyle} key={r} value={r}>{r === "auto" ? "自动" : r.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="relative flex h-7 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 leading-none transition hover:brightness-110" style={{ background: theme.node.panel, opacity: running || !qualityOptions.length ? 0.45 : 1 }}>
                            <span className="shrink-0 text-[10px]" style={{ color: theme.node.muted }}>质量</span>
                            <span className="truncate font-mono font-semibold" style={{ color: theme.node.text }}>{quality === "auto" ? "自动" : quality}</span>
                            <ChevronDown className="size-3 shrink-0 opacity-50" style={{ color: theme.node.muted }} />
                            <select aria-label="生成质量" disabled={running || !qualityOptions.length} className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed" value={quality} onChange={(e) => ctx.updateMetadata({ quality: e.target.value })}>
                                {(qualityOptions.length ? qualityOptions : ["auto"]).map((q) => <option style={optionStyle} key={q} value={q}>{q === "auto" ? "自动" : q}</option>)}
                            </select>
                        </div>
                    </div>
                </>;
            })()}
        </div>
        <div data-node-scroll className="min-h-0 flex-1 space-y-2 overflow-auto overscroll-contain px-3 py-2.5">
            {!rows.length && <div data-node-no-drag className="select-text rounded-xl border border-dashed px-3 py-6 text-center leading-relaxed" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>将多维表格的右侧输出连接到这里。图片组和文本在表格中按行配对。</div>}
            {rows.map((row) => {
                const task = batchTasks.find((t) => t.rowNumber === row.rowNumber);
                const selected = manualSelection ? Boolean(meta.tableBatchSelectedRows?.includes(row.rowNumber)) : row.rowNumber >= startRow;
                const isRunningRow = task?.status === "running" && running;
                const status = task ? TASK_STATUS_STYLE[task.status === "running" && !running ? "interrupted" : task.status] : undefined;
                const rowImages = row.media.filter((m) => m.mediaType === "image");
                return <div key={row.rowNumber} data-node-no-drag role="group" aria-label={`第 ${row.rowNumber} 行输入`} tabIndex={manualSelection && !running ? 0 : undefined} onClick={() => selectRow(row.rowNumber)} onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); selectRow(row.rowNumber); } }} className={`rounded-xl border p-2.5 transition-all ${manualSelection && !running ? "cursor-pointer hover:bg-[#0ea977]/[0.04]" : ""}`} style={{ borderColor: isRunningRow ? theme.accent.base : selected && manualSelection ? theme.node.activeStroke : softBorder, background: isRunningRow ? theme.accent.soft : selected ? theme.glass.inset : "transparent", opacity: selected ? 1 : 0.55 }}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <input aria-label={`选择第 ${row.rowNumber} 行输入`} type="checkbox" className="size-3.5 shrink-0 cursor-pointer rounded accent-[#0ea977] disabled:cursor-default" disabled={running || !manualSelection} checked={selected} onClick={stop} onChange={(e) => selectRow(row.rowNumber, e.target.checked)} />
                            <b className="font-mono text-[11px]">#{row.rowNumber}</b>
                            {rowImages.length > 0 && <span className="text-[10px]" style={{ color: theme.node.muted }}>{rowImages.length} 图</span>}
                        </div>
                        {status && <span title={task?.error} className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: status.bg, color: status.color }}><span className={`size-1.5 shrink-0 rounded-full ${isRunningRow ? "animate-pulse" : ""}`} style={{ background: status.dot }} />{status.label}</span>}
                    </div>
                    <div className="flex items-start gap-2">
                        {rowImages.length > 0 && <div data-node-scroll className="flex max-w-32 shrink-0 gap-1 overflow-x-auto overscroll-contain">
                            {rowImages.map((m) => <img key={m.nodeId} alt={m.title} src={previewUrlFor(m.storageKey) || m.url} className="size-11 shrink-0 rounded-lg border object-cover" style={{ borderColor: softBorder }} decoding="async" draggable={false} />)}
                        </div>}
                        <div data-node-scroll data-node-no-drag className="max-h-20 min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain whitespace-pre-wrap break-words select-text text-[11px] leading-relaxed" style={{ color: row.text ? theme.node.muted : theme.node.faint }}>{row.text || "（仅图片参考）"}</div>
                    </div>
                </div>;
            })}
        </div>
        <div className="shrink-0 space-y-2 border-t px-3 py-2.5" style={{ borderColor: softBorder, background: theme.glass.inset }}>
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                <div className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1" style={{ background: theme.glass.inset }}>
                    <span className="px-0.5" style={{ color: theme.node.muted }}>并发</span>
                    <button type="button" aria-label="减少并发数" disabled={running || concurrency <= 1} className="grid size-5 place-items-center rounded transition hover:opacity-75 disabled:opacity-35" style={{ background: theme.node.panel, color: theme.node.text }} onClick={() => ctx.updateMetadata({ tableBatchConcurrency: Math.max(1, concurrency - 1) })}><Minus className="size-3" /></button>
                    <input aria-label="并发数" disabled={running} type="number" min={1} className="w-8 bg-transparent text-center font-mono font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" style={{ color: theme.node.text }} value={concurrency} onChange={(e) => ctx.updateMetadata({ tableBatchConcurrency: Math.max(1, Number(e.target.value) || 1) })} />
                    <button type="button" aria-label="增加并发数" disabled={running} className="grid size-5 place-items-center rounded transition hover:opacity-75 disabled:opacity-35" style={{ background: theme.node.panel, color: theme.node.text }} onClick={() => ctx.updateMetadata({ tableBatchConcurrency: concurrency + 1 })}><Plus className="size-3" /></button>
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg p-0.5" style={{ background: theme.glass.inset }}>
                    <div className="inline-flex items-center rounded-md px-1.5 py-0.5 transition" style={{ background: !manualSelection ? theme.node.panel : "transparent", color: !manualSelection ? theme.node.text : theme.node.muted }} onClick={() => { if (!running && manualSelection) ctx.updateMetadata({ tableBatchManualSelection: false }); }}>
                        <span>从第</span>
                        <input aria-label="起始行" type="number" min={1} disabled={running || manualSelection} className="mx-0.5 w-7 bg-transparent text-center font-mono font-semibold outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" style={{ color: theme.accent.base }} value={startRow} onClick={stop} onChange={(e) => ctx.updateMetadata({ tableBatchStartRow: Math.max(1, Number(e.target.value) || 1) })} />
                        <span>行</span>
                    </div>
                    <label className="inline-flex cursor-pointer select-none items-center gap-1 rounded-md px-1.5 py-0.5 transition" style={{ background: manualSelection ? theme.accent.soft : "transparent", color: manualSelection ? theme.accent.base : theme.node.muted }}>
                        <input type="checkbox" className="size-3 accent-[#0ea977]" disabled={running} checked={manualSelection} onChange={(e) => ctx.updateMetadata({ tableBatchManualSelection: e.target.checked })} />
                        <span>独立选择</span>
                    </label>
                </div>
            </div>
            <div className="flex items-start gap-1.5 rounded-xl border px-2 py-1.5 transition-colors focus-within:border-[#0ea977] dark:focus-within:border-[#37d39b]" style={{ borderColor: softBorder, background: theme.node.panel }}>
                <Sparkles className="mt-0.5 size-3.5 shrink-0 opacity-60" style={{ color: theme.accent.base }} />
                <textarea aria-label="附加提示词" disabled={running} rows={2} data-node-scroll className="min-w-0 flex-1 resize-none overscroll-contain bg-transparent text-xs leading-relaxed outline-none disabled:opacity-45" style={{ color: theme.node.text }} placeholder="附加提示词（可空，会追加到每行末尾）" value={meta.prompt || ""} onChange={(e) => ctx.updateMetadata({ prompt: e.target.value })} />
            </div>
            {(error || meta.errorDetails) && <p role="alert" className="rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] text-red-500">{error || meta.errorDetails}</p>}
            <div className="flex items-center gap-2">
                <button type="button" className={ghostButton} style={{ background: theme.glass.inset, color: theme.node.text }} disabled={running || !meta.tableBatchRun} onClick={() => void run(true)}><RotateCcw className="size-3.5" />重试未完成行</button>
                {running
                    ? <button type="button" className={`${primaryButton} flex-1`} style={{ background: "#ef4444" }} onClick={() => { controller.current?.abort(); stopWorkflowNode(node.id, backgroundProjectId); controller.current = null; setRunning(false); }}><Square className="size-3" />停止</button>
                    : <button type="button" className={`${primaryButton} flex-1`} style={{ backgroundImage: primaryGradient }} onClick={() => void run()}><Play className="size-3.5" /><span className="sr-only">▶ </span>运行 {activeRows.length} 行</button>}
            </div>
        </div>
    </div>;
}

export const dxosNodeDefinitions: CanvasNodeDefinition[] = [
    { type: TABLE_TYPE, title: "多维表格", icon: <Table2 className="size-4" />, defaultSize: { width: 520, height: 350 }, defaultMetadata: { ...workflowDisplayMetadata, table: emptyTable(), tableInputChannels: [{ id: "input-1" }, { id: "input-2" }] }, hidePanel: true, Content: TableContent },
    { type: CONCURRENT_TYPE, title: "并发生成", icon: <Layers className="size-4" />, defaultSize: { width: 340, height: 450 }, defaultMetadata: { ...workflowDisplayMetadata, tableBatchConcurrency: 1, tableBatchStartRow: 1, generationMode: "image" }, hidePanel: true, Content: ConcurrentContent },
];
