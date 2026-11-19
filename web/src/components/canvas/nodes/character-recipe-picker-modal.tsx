import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pagination } from "antd";
import { useReducedMotion } from "motion/react";
import { Check, ImageOff, Images, Search } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { getPoseThumbUrl, loadPoseGallerySlot, recipeSlotLabels, recipeSlots, resolveGalleryUrl, type CharacterRecipe, type GalleryData, type GalleryItem, type RecipeSlot } from "@/services/api/pose-gallery";

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

export function CharacterRecipePickerModal({ initialSlot, safe, useDepth, onSafeChange, onDepthChange, onPick, onClose, linked, selection }: {
    initialSlot: RecipeSlot; safe: boolean; useDepth: boolean; onSafeChange: (safe: boolean) => void; onDepthChange: (depth: boolean) => void;
    onPick: (slot: RecipeSlot, item: GalleryItem) => void; onClose: () => void; linked: RecipeSlot[]; selection?: CharacterRecipe["slots"];
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
    // 只加载当前分类：三个库一次性并发读会在首次打开时卡十几秒（索引 + 本地缓存写入互相排队）。
    useEffect(() => {
        let active = true;
        void loadPoseGallerySlot(tab).then((items) => {
            if (active) { setData((current) => ({ ...current, [tab]: items })); setErrors((current) => ({ ...current, [tab]: undefined })); }
        }, (e: unknown) => { if (active) setErrors((current) => ({ ...current, [tab]: e instanceof Error ? e.message : "无法读取图库" })); });
        return () => { active = false; };
    }, [tab, retry]);
    const library = useMemo(() => (data[tab] || []).filter((item) => !safe || !item.sensitive), [data, safe, tab]);
    const fields = ["group", "category", "angle"] as const;
    const filterOptions = fields.map((field, index) => index === 2 ? angleOrder : [...new Set(library.filter((item) => !index || !filters[0] || item.group === filters[0]).map((item) => item[field]).filter(Boolean))]);
    const results = useMemo(() => library.filter((item) => (!filters[0] || item.group === filters[0]) && (!filters[1] || item.category === filters[1]) && (!filters[2] || item.angle === filters[2]) && item.search.includes(deferredQuery)), [library, filters, deferredQuery]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(results.length / pageSize)));
    const locked = linked.includes(tab);
    const currentSelection = selection?.[tab];
    const selectedItem = currentSelection?.kind === "gallery" ? currentSelection.item : undefined;
    const inset = { background: theme.glass.inset, borderColor: theme.node.stroke };
    const onFilterChange = (index: number, next: string) => {
        setFilters((current) => current.map((value, i) => i === index ? next : index === 0 && i === 1 ? "" : value));
        setPage(1);
    };
    return <Modal open centered footer={null} onCancel={onClose} width="min(1040px, 94vw)" zIndex={1400} modalRender={renderOverlay}
        title={<div className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: theme.accent.soft, color: theme.toolbar.activeText }}><Images size={17} /></div><div><div className="text-base font-semibold">角色参考图库</div><div className="text-xs font-normal" style={{ color: theme.node.muted }}>挑出这一幕的角色、服装与姿势</div></div></div>}
        styles={{ container: { background: theme.node.panel, color: theme.node.text, borderRadius: 24 }, header: { background: "transparent", color: theme.node.text } }}>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y py-2.5" style={{ borderColor: theme.node.stroke }}>
            <div className="relative inline-grid max-w-full grid-cols-3 rounded-2xl p-1" role="group" aria-label="图库分类" style={inset}>
                <div aria-hidden="true" className="pointer-events-none absolute inset-1"><span data-recipe-library-pill className="block h-full w-1/3 rounded-xl shadow-xs motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out" style={{ background: theme.accent.base, transform: `translateX(${recipeSlots.indexOf(tab) * 100}%)` }} /></div>
                {recipeSlots.map((slot) => {
                    const active = slot === tab, count = data[slot]?.length;
                    return <button key={slot} type="button" aria-pressed={active} onClick={() => { setTab(slot); setFilters(["", "", ""]); setQuery(""); setPage(1); }} className="relative inline-flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline sm:px-3" style={{ color: active ? theme.node.panel : theme.node.muted }}>
                        {recipeSlotLabels[slot]}库{count !== undefined && <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] tabular-nums">{count.toLocaleString()}</span>}
                    </button>;
                })}
            </div>
            <label className="flex max-w-full items-center gap-2 rounded-xl border px-3 py-2" style={inset}><Search size={14} style={{ color: theme.node.muted }} /><input aria-label="搜索图库" placeholder="搜索中文名称、动作或标签" className="w-48 min-w-0 bg-transparent text-xs outline-none focus-visible:outline" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
        </div>
        <div className="grid gap-1.5 py-2.5 text-xs" style={{ color: theme.node.muted }}>
            {filterLabels[tab].map((label, index) => {
                const options = filterOptions[index];
                if (index === 1 && tab !== "portrait") return <label key={label} className="flex min-w-0 items-center gap-2"><span className="w-14 shrink-0 text-[11px] font-medium">{label}</span><select aria-label={label} value={filters[index]} onChange={(event) => onFilterChange(index, event.target.value)} className="max-w-full rounded-lg border px-2.5 py-1 text-xs outline-none focus-visible:outline" style={{ ...inset, color: theme.node.text }}><option value="" style={{ background: theme.node.panel }}>全部{label}</option>{options.map((value) => <option style={{ background: theme.node.panel }} key={value} value={value}>{value}</option>)}</select></label>;
                return <div key={label} role="group" aria-label={label} className="flex min-w-0 items-center gap-2"><span className="w-14 shrink-0 text-[11px] font-medium">{label}</span><div className="thin-scrollbar flex min-w-0 items-center gap-1.5 overflow-x-auto px-0.5 py-0.5">
                    {["", ...options].map((value) => {
                        const active = filters[index] === value;
                        return <button key={value} type="button" aria-pressed={active} onClick={() => onFilterChange(index, value)} className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition hover:brightness-110 focus-visible:outline" style={active ? { background: theme.accent.soft, color: theme.toolbar.activeText, borderColor: `color-mix(in srgb, ${theme.accent.base} 40%, transparent)` } : { ...inset, borderColor: "transparent", color: theme.node.muted }}>{value || "全部"}</button>;
                    })}
                </div></div>;
            })}
            <div className="flex flex-wrap items-center gap-2">
                {tab === "pose" && <RecipeDepthToggle value={useDepth} onChange={onDepthChange} />}
                <label className="ml-auto flex items-center gap-1.5 py-0.5 text-[11px]" title="隐藏图库标记为敏感或属于敏感分类的素材"><input type="checkbox" checked={safe} style={{ accentColor: theme.accent.base }} onChange={(event) => { onSafeChange(event.target.checked); setFilters(["", "", ""]); setPage(1); }} />安全模式</label>
            </div>
        </div>
        {locked && <p className="mb-2 text-xs" style={{ color: theme.toolbar.activeText }}>该槽位正在使用上游连线。断开连线后可从此库选图。</p>}
        <div className="thin-scrollbar h-[min(45vh,480px)] min-h-28 overflow-y-auto overscroll-contain" key={`${tab}:${currentPage}`}>
            {error ? <div role="alert" className="grid h-full place-content-center gap-3 text-center text-sm"><p>{error}</p><button type="button" className="underline" onClick={() => { setErrors((current) => ({ ...current, [tab]: undefined })); setRetry((value) => value + 1); }}>重试</button></div> : !loaded || !results.length ? <p role="status" className="py-16 text-center text-sm" style={{ color: theme.node.muted }}>{loaded ? "没有符合条件的素材" : "正在加载图库…"}</p> : <div className="grid grid-cols-2 gap-2.5 px-0.5 py-1 sm:grid-cols-4 lg:grid-cols-6">
                {results.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((item) => {
                    const selected = !locked && selectedItem?.id === item.id && selectedItem.source === item.source;
                    const badge = tab === "pose" ? item.angle : tab === "portrait" ? item.category : "";
                    return <button key={`${item.source}:${item.id}`} type="button" title={item.name} aria-label={`选用 ${item.name}`} aria-pressed={selected} disabled={locked} onClick={() => onPick(tab, item)} className="group relative aspect-[4/5] min-w-0 overflow-hidden rounded-2xl border border-[color:var(--poster-border)] text-left transition duration-200 enabled:hover:border-[color:var(--poster-accent)] enabled:hover:shadow-[0_12px_28px_-8px_var(--poster-shadow)] focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:enabled:hover:-translate-y-0.5" style={{ background: theme.node.fill, color: theme.node.muted, ["--poster-border" as string]: selected ? theme.accent.base : theme.node.stroke, ["--poster-accent" as string]: theme.accent.base, ["--poster-shadow" as string]: theme.accent.soft }}>
                        <ImageOff aria-hidden size={18} className="absolute left-1/2 top-1/2 -translate-1/2 opacity-40" />
                        <img key={String(tab === "pose" && useDepth)} alt="" src={tab === "pose" ? getPoseThumbUrl(item, useDepth) : resolveGalleryUrl(item.thumbnail)} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                        <div className="absolute inset-x-2 top-2 flex justify-end gap-1.5">{badge && <span className="rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">{badge}</span>}{selected && <span className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: theme.accent.base, color: theme.node.panel }} title="已选用"><Check size={12} /></span>}</div>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/65 to-transparent p-2 pt-5 text-white"><p className="truncate text-xs font-semibold">{item.name}</p>{(item.category || item.group) && <p className="truncate text-[10px] text-white/80">{tab === "portrait" ? item.group : item.category || item.group}</p>}</div>
                    </button>;
                })}
            </div>}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}><span>来源：<a href="https://github.com/anhao/ai-pose-gallery-zh" target="_blank" rel="noreferrer" className="underline">AI Pose Gallery</a> · 请遵守各素材授权</span>{loaded && results.length > 0 && <Pagination size="small" current={currentPage} pageSize={pageSize} total={results.length} showSizeChanger={false} showLessItems onChange={setPage} />}</div>
    </Modal>;
}

export function CharacterRecipePreviewModal({ title, open, mousePosition, image, error, onClose, afterClose, onUse }: { title: string; open: boolean; mousePosition?: { x: number; y: number }; image?: string; error?: string; onClose: () => void; afterClose: () => void; onUse?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const reduceMotion = useReducedMotion();
    return <Modal open={open} centered title={title} mousePosition={mousePosition} transitionName={reduceMotion ? "" : undefined} maskTransitionName={reduceMotion ? "" : undefined} onCancel={onClose} afterClose={afterClose} width="min(900px, 94vw)" footer={null} zIndex={1400} modalRender={renderOverlay} styles={{ container: { background: theme.node.panel, color: theme.node.text }, header: { background: "transparent" } }}>
        {image ? <img src={image} alt={title} className="mx-auto max-h-[65vh] max-w-full rounded-xl object-contain" /> : <p className="py-16 text-center" role={error ? "alert" : "status"}>{error || "正在读取参考图…"}</p>}
        {onUse && image && <div className="mt-3 flex justify-end"><button type="button" onClick={onUse} className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ color: theme.toolbar.activeText, background: theme.toolbar.activeBg }}>使用拼图作为参考</button></div>}
    </Modal>;
}
