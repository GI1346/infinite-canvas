import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pagination } from "antd";
import { ImageOff, Images, Search } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { getPoseThumbUrl, loadPoseGallerySlot, recipeSlotLabels, recipeSlots, resolveGalleryUrl, type GalleryData, type GalleryItem, type RecipeSlot } from "@/services/api/pose-gallery";

const pageSize = 48;
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
const renderOverlay = (modal: ReactNode) => <div data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore onPointerDown={stop} onMouseDown={stop} onClick={stop} onKeyDown={stop} onWheel={stop}>{modal}</div>;
const angleOrder = ["正面", "俯视", "仰视", "侧面", "斜侧"];
const filterLabels = { portrait: ["分区", "发长"], costume: ["一级分类", "穿搭分类"], pose: ["动作体系", "动作分类", "视角"] };

export function RecipeDepthToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <div role="group" aria-label="姿势参考类型" className="inline-flex shrink-0 gap-0.5 rounded-full border p-0.5" style={{ borderColor: theme.node.stroke }}>
        {([false, true] as const).map((depth) => <button key={String(depth)} type="button" aria-pressed={value === depth} onClick={() => onChange(depth)} className="rounded-full px-1.5 py-0.5 text-[10px] leading-4" style={{ color: value === depth ? theme.toolbar.activeText : theme.node.muted, background: value === depth ? theme.toolbar.activeBg : undefined }}>{depth ? "深度" : "白模"}</button>)}
    </div>;
}

export function CharacterRecipePickerModal({ initialSlot, safe, useDepth, onSafeChange, onDepthChange, onPick, onClose, linked }: {
    initialSlot: RecipeSlot; safe: boolean; useDepth: boolean; onSafeChange: (safe: boolean) => void; onDepthChange: (depth: boolean) => void;
    onPick: (slot: RecipeSlot, item: GalleryItem) => void; onClose: () => void; linked: RecipeSlot[];
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [tab, setTab] = useState(initialSlot);
    const [data, setData] = useState<Partial<GalleryData>>({});
    const [errors, setErrors] = useState<Partial<Record<RecipeSlot, string>>>({});
    const [retry, setRetry] = useState(0);
    const error = errors[tab], loaded = Boolean(data[tab]);
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query.trim().toLowerCase());
    const [filters, setFilters] = useState(["", "", ""]);
    const [page, setPage] = useState(1);
    useEffect(() => {
        let active = true;
        for (const slot of recipeSlots) void loadPoseGallerySlot(slot).then((items) => {
            if (active) { setData((current) => ({ ...current, [slot]: items })); setErrors((current) => ({ ...current, [slot]: undefined })); }
        }, (e: unknown) => { if (active) setErrors((current) => ({ ...current, [slot]: e instanceof Error ? e.message : "无法读取图库" })); });
        return () => { active = false; };
    }, [retry]);
    const library = useMemo(() => (data[tab] || []).filter((item) => !safe || !item.sensitive), [data, safe, tab]);
    const fields = ["group", "category", "angle"] as const;
    const filterOptions = fields.map((field, index) => index === 2 ? angleOrder : [...new Set(library.filter((item) => !index || !filters[0] || item.group === filters[0]).map((item) => item[field]).filter(Boolean))]);
    const results = useMemo(() => library.filter((item) => (!filters[0] || item.group === filters[0]) && (!filters[1] || item.category === filters[1]) && (!filters[2] || item.angle === filters[2]) && item.search.includes(deferredQuery)), [library, filters, deferredQuery]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(results.length / pageSize)));
    const locked = linked.includes(tab);
    return <Modal open centered footer={null} onCancel={onClose} width="min(1040px, 94vw)" zIndex={1400} modalRender={renderOverlay}
        title={<div className="flex items-center gap-3"><Images size={20} style={{ color: theme.accent.base }} /><div><div className="text-base font-semibold">角色参考图库</div><div className="text-xs font-normal" style={{ color: theme.node.muted }}>选择人像、服装和姿势参考</div></div></div>}
        styles={{ container: { background: theme.node.panel, color: theme.node.text, borderRadius: 24 }, header: { background: "transparent", color: theme.node.text } }}>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y py-2.5" style={{ borderColor: theme.node.stroke }}>
            <div className="flex flex-wrap gap-1" role="group" aria-label="图库分类">{recipeSlots.map((slot) => <button key={slot} type="button" aria-pressed={slot === tab} onClick={() => { setTab(slot); setFilters(["", "", ""]); setQuery(""); setPage(1); }} className="rounded-full px-3 py-1.5 text-xs" style={{ color: slot === tab ? theme.toolbar.activeText : theme.node.muted, background: slot === tab ? theme.toolbar.activeBg : undefined }}>{recipeSlotLabels[slot]}库{data[slot] ? ` ${data[slot].length.toLocaleString()}` : ""}</button>)}</div>
            <label className="flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: theme.node.stroke }}><Search size={14} /><input aria-label="搜索图库" placeholder="搜索中文名称、动作或标签" className="w-48 bg-transparent text-xs outline-none" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2 py-2.5 text-xs">
            {filterLabels[tab].map((label, index) => <select key={label} aria-label={label} value={filters[index]} onChange={(event) => { setFilters((current) => current.map((value, i) => i === index ? event.target.value : index === 0 && i === 1 ? "" : value)); setPage(1); }} className="max-w-full rounded-full border px-2.5 py-1" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}><option value="">全部{label}</option>{filterOptions[index].map((value) => <option key={value} value={value}>{value}</option>)}</select>)}
            {tab === "pose" && <RecipeDepthToggle value={useDepth} onChange={onDepthChange} />}
            <label className="ml-auto flex items-center gap-1.5" title="隐藏图库标记为敏感或属于敏感分类的素材"><input type="checkbox" checked={safe} onChange={(event) => { onSafeChange(event.target.checked); setFilters(["", "", ""]); setPage(1); }} />安全模式</label>
        </div>
        {locked && <p className="mb-2 text-xs" style={{ color: theme.toolbar.activeText }}>该槽位正在使用上游连线。断开连线后可从此库选图。</p>}
        <div className="thin-scrollbar h-[min(50vh,530px)] min-h-32 overflow-y-auto overscroll-contain" key={`${tab}:${currentPage}`}>
            {error ? <div role="alert" className="grid h-full place-content-center gap-3 text-center text-sm"><p>{error}</p><button type="button" className="underline" onClick={() => { setErrors((current) => ({ ...current, [tab]: undefined })); setRetry((value) => value + 1); }}>重试</button></div> : !loaded || !results.length ? <p role="status" className="py-16 text-center text-sm" style={{ color: theme.node.muted }}>{loaded ? "没有符合条件的素材" : "正在加载图库…"}</p> : <div className="grid grid-cols-2 gap-2 px-0.5 sm:grid-cols-4 lg:grid-cols-6">
                {results.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((item) => <button key={`${item.source}:${item.id}`} type="button" title={item.name} aria-label={`选用 ${item.name}`} disabled={locked} onClick={() => onPick(tab, item)} className="group min-w-0 overflow-hidden rounded-xl border text-left transition hover:brightness-110 focus-visible:outline disabled:cursor-not-allowed disabled:opacity-60" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                    <div className="relative aspect-[4/5] overflow-hidden"><ImageOff aria-hidden size={17} className="absolute left-1/2 top-1/2 -translate-1/2 opacity-30" /><img key={String(tab === "pose" && useDepth)} alt="" src={tab === "pose" ? getPoseThumbUrl(item, useDepth) : resolveGalleryUrl(item.thumbnail)} loading="lazy" decoding="async" className="relative h-full w-full object-cover" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /></div>
                    <div className="px-2 py-1.5"><p className="truncate text-xs font-medium">{item.name}</p><p className="truncate text-[10px]" style={{ color: theme.node.muted }}>{[item.category, item.angle].filter(Boolean).join(" · ")}</p></div>
                </button>)}
            </div>}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}><span>来源：<a href="https://github.com/anhao/ai-pose-gallery-zh" target="_blank" rel="noreferrer" className="underline">AI Pose Gallery</a> · 请遵守各素材授权</span>{loaded && results.length > 0 && <Pagination size="small" current={currentPage} pageSize={pageSize} total={results.length} showSizeChanger={false} showLessItems onChange={setPage} />}</div>
    </Modal>;
}

export function CharacterRecipePreviewModal({ title, image, error, onClose, onUse }: { title: string; image?: string; error?: string; onClose: () => void; onUse?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <Modal open centered title={title} onCancel={onClose} width="min(900px, 94vw)" footer={null} zIndex={1400} modalRender={renderOverlay} styles={{ container: { background: theme.node.panel, color: theme.node.text }, header: { background: "transparent" } }}>
        {image ? <img src={image} alt={title} className="mx-auto max-h-[65vh] max-w-full rounded-xl object-contain" /> : <p className="py-16 text-center" role={error ? "alert" : "status"}>{error || "正在读取参考图…"}</p>}
        {onUse && image && <div className="mt-3 flex justify-end"><button type="button" onClick={onUse} className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ color: theme.toolbar.activeText, background: theme.toolbar.activeBg }}>使用拼图作为参考</button></div>}
    </Modal>;
}
