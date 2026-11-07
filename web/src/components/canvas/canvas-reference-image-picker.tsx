import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import { Images, Search } from "lucide-react";
import { LibraryImage } from "@/components/library/image-library";
import { collectGalleryImages, type GalleryImage } from "@/pages/gallery/gallery-data";
import { canvasThemes } from "@/lib/canvas-theme";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useGenerationHistoryStore } from "@/stores/use-generation-history-store";
import { useThemeStore } from "@/stores/use-theme-store";

type Tab = "all" | "history" | "gallery";
type PickerImage = GalleryImage & { source: "history" | "gallery" };

export function CanvasReferenceImagePicker({ initialTab, onSelect, onClose }: { initialTab: Tab; onSelect: (item: GalleryImage) => Promise<void>; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const projects = useCanvasStore((state) => state.projects), canvasReady = useCanvasStore((state) => state.hydrated);
    const assets = useAssetStore((state) => state.assets), assetReady = useAssetStore((state) => state.hydrated);
    const { logs, loading, error, refresh } = useGenerationHistoryStore();
    const [tab, setTab] = useState<Tab>(initialTab), [query, setQuery] = useState("");
    const [preview, setPreview] = useState<PickerImage | null>(null), [pendingId, setPendingId] = useState<string | null>(null), [failure, setFailure] = useState("");
    useEffect(() => { void refresh(); }, [refresh]);
    const history = useMemo(() => collectGalleryImages(projects, logs).map((item): PickerImage => ({ ...item, source: "history" })), [projects, logs]);
    const favorites = useMemo(() => assets.flatMap((asset): PickerImage[] => asset.kind === "image" ? [{ id: asset.id, title: asset.title, prompt: asset.note || "", model: String(asset.metadata?.model || ""), quality: "", date: Date.parse(asset.createdAt), width: asset.data.width, height: asset.data.height, storageKey: asset.data.storageKey, url: asset.data.dataUrl, sources: [{ label: "图片库" }], source: "gallery" }] : []), [assets]);
    const filtered = useMemo(() => {
        const items = tab === "history" ? history : tab === "gallery" ? favorites : [...history, ...favorites];
        const unique = [...new Map(items.map((item) => [item.storageKey || item.url || item.id, item])).values()];
        return unique.filter((item) => `${item.title} ${item.prompt} ${item.model} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()));
    }, [tab, history, favorites, query]);
    const detail = preview && filtered.some((item) => item.id === preview.id) ? preview : filtered[0];
    const select = async (item: GalleryImage) => {
        if (pendingId) return;
        setPendingId(item.id); setFailure("");
        try { await onSelect(item); }
        catch (error) { setFailure(error instanceof Error ? error.message : "图片无法读取，未添加引用。请重试。"); }
        finally { setPendingId(null); }
    };
    return <Modal open centered footer={null} width="min(1080px, 94vw)" onCancel={onClose} destroyOnHidden
        title={<div className="flex items-center gap-3"><Images size={20} style={{ color: theme.toolbar.activeText }} /><div><div className="text-base font-semibold">选择素材</div><p className="mt-1 text-xs font-normal" style={{ color: theme.node.muted }}>点击图片，连接到当前生成配置并插入引用</p></div></div>}
        styles={{ container: { background: theme.node.panel, color: theme.node.text, borderRadius: 24 }, header: { background: "transparent", color: theme.node.text }, body: { paddingTop: 12 } }}
        modalRender={(modal) => <div data-config-image-picker data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{modal}</div>}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y py-3" style={{ borderColor: theme.node.stroke }}>
            <div className="flex gap-1 rounded-full p-1" style={{ background: theme.node.fill }}>{[{ value: "all" as const, label: "全部" }, { value: "history" as const, label: "生成历史" }, { value: "gallery" as const, label: "图片库" }].map((item) => <button key={item.value} type="button" aria-pressed={tab === item.value} className="rounded-full px-3 py-1.5 text-sm" style={{ color: tab === item.value ? theme.toolbar.activeText : theme.node.muted, background: tab === item.value ? theme.toolbar.activeBg : "transparent" }} onClick={() => { setTab(item.value); setPreview(null); }}>{item.label}</button>)}</div>
            <label className="flex w-80 max-w-full items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}><Search size={14} /><input aria-label="搜索素材图片" placeholder="搜索图片名称、提示词或模型" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" style={{ color: theme.node.text }} /></label>
        </div>
        {(failure || error) && <p role="alert" className="mb-3 text-sm text-red-500">{failure || error}</p>}
        <div className="flex h-[min(65vh,650px)] min-h-64 gap-4">
            <div className="thin-scrollbar min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                {!canvasReady || !assetReady || (loading && !filtered.length) ? <p className="py-20 text-center text-sm" style={{ color: theme.node.muted }}>正在读取本地图片…</p> : !filtered.length ? <p className="py-20 text-center text-sm" style={{ color: theme.node.muted }}>{query ? "没有匹配的图片" : "暂无图片"}</p> : <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(132px,1fr))" }}>{filtered.map((item) => <button key={`${item.source}:${item.id}`} type="button" aria-label={`引用 ${item.title}`} disabled={pendingId !== null} title={item.title} onClick={() => void select(item)} onPointerEnter={() => setPreview(item)} onFocus={() => setPreview(item)} className="group relative min-w-0 overflow-hidden rounded-2xl border text-left transition-colors disabled:opacity-50" style={{ borderColor: detail?.id === item.id ? theme.node.activeStroke : theme.node.stroke, background: theme.node.panel }}>
                    <div className="relative"><LibraryImage item={item} /><span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px]" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{item.source === "history" ? "生成历史" : "图片库"}</span>{pendingId === item.id && <span className="absolute inset-0 grid place-items-center text-xs" style={{ background: theme.toolbar.panel }}>正在添加引用…</span>}</div>
                    <div className="p-2"><p className="truncate text-xs font-medium">{item.title}</p><p className="mt-1 text-[10px]" style={{ color: theme.node.muted }}>{item.width && item.height ? `${item.width} × ${item.height}` : "图片素材"}</p></div>
                </button>)}</div>}
            </div>
            {detail && <aside className="hidden w-56 shrink-0 overflow-y-auto border-l pl-4 md:block" style={{ borderColor: theme.node.stroke }}><div className="overflow-hidden rounded-xl"><LibraryImage item={detail} /></div><h3 className="mt-3 break-words text-sm font-semibold">{detail.title}</h3><p className="mt-2 text-xs" style={{ color: theme.node.muted }}>{detail.source === "history" ? "生成历史" : "图片库"}{detail.width && detail.height ? ` · ${detail.width} × ${detail.height}` : ""}</p>{detail.model && <p className="mt-2 break-words text-xs" style={{ color: theme.node.muted }}>{detail.model}</p>}</aside>}
        </div>
    </Modal>;
}
