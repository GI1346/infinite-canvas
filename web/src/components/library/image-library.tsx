import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, ConfigProvider, Input, Modal, Segmented, Select, Slider } from "antd";
import { Copy, Grid2X2, Heart, Minus, Plus, RefreshCw, Search, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCopyText } from "@/hooks/use-copy-text";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImagePreviewDialog } from "@/components/canvas/canvas-image-preview-dialog";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { recordCanvasImageHistory, useGenerationHistoryStore } from "@/stores/use-generation-history-store";
import { ensureImagePreview, getImageBlob, previewUrlFor, resolveImageUrl, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { collectGalleryImages, type GalleryImage } from "@/pages/gallery/gallery-data";
import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { insertLibraryItem } from "./library-data";

export function ImageLibraryBrowser({ mode, compact = false, onInsert }: { mode: "history" | "gallery"; compact?: boolean; onInsert?: (payload: InsertAssetPayload) => void | Promise<void> }) {
    const { message } = App.useApp(), navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const copy = useCopyText();
    const [withPromptOnly, setWithPromptOnly] = useState(false), [sendingPrompt, setSendingPrompt] = useState(false);
    const projects = useCanvasStore((state) => state.projects), hydrated = useCanvasStore((state) => state.hydrated);
    const assets = useAssetStore((state) => state.assets), assetReady = useAssetStore((state) => state.hydrated);
    const addAsset = useAssetStore((state) => state.addAsset), removeAsset = useAssetStore((state) => state.removeAsset);
    const { logs, loading, error, refresh } = useGenerationHistoryStore();
    const [query, setQuery] = useState(""), [preview, setPreview] = useState<GalleryImage | null>(null), [previewUrl, setPreviewUrl] = useState("");
    const [sending, setSending] = useState<GalleryImage | null>(null), [projectId, setProjectId] = useState(""), [busy, setBusy] = useState(false);
    const [thumbnailSize, setThumbnailSize] = useState(compact ? 140 : 200), [inserting, setInserting] = useState<string[]>([]);
    const previewRequest = useRef(0);
    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => { if (hydrated) projects.forEach((project) => { void recordCanvasImageHistory(project).catch(() => undefined); }); }, [hydrated, projects]);
    const favorites = useMemo(() => assets.filter((asset) => asset.kind === "image").map((asset): GalleryImage => ({ id: asset.id, title: asset.title, prompt: asset.note || "", model: String(asset.metadata?.model || ""), quality: "", date: Date.parse(asset.createdAt), width: asset.kind === "image" ? asset.data.width : 0, height: asset.kind === "image" ? asset.data.height : 0, storageKey: asset.kind === "image" ? asset.data.storageKey : undefined, url: asset.kind === "image" ? asset.data.dataUrl : "", sources: [{ label: "收藏图片" }] })), [assets]);
    const items = useMemo(() => mode === "gallery" ? favorites : collectGalleryImages([], logs), [mode, favorites, logs]);
    const filtered = items.filter((item) => (compact || !withPromptOnly || Boolean(item.prompt.trim())) && [item.title, item.prompt, item.model, ...item.sources.map((source) => source.label)].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
    const previewIndex = filtered.findIndex((item) => item.id === preview?.id);
    const favoriteOf = (item: GalleryImage) => assets.find((asset) => asset.kind === "image" && (item.storageKey ? asset.data.storageKey === item.storageKey : asset.data.dataUrl === item.url));
    const original = async (item: GalleryImage) => { const url = await resolveImageUrl(item.storageKey, item.storageKey ? "" : item.url); if (!url) throw new Error("原图已被清理或无法读取"); return url; };
    const view = async (item: GalleryImage) => {
        const request = ++previewRequest.current;
        try { const url = await original(item); if (request === previewRequest.current) { setPreview(item); setPreviewUrl(url); } }
        catch (error) { if (request === previewRequest.current) message.error(error instanceof Error ? error.message : "无法读取原图"); }
    };
    const favorite = async (item: GalleryImage) => {
        const existing = favoriteOf(item);
        if (existing) { removeAsset(existing.id); return; }
        try {
            const blob = item.storageKey ? await getImageBlob(item.storageKey) : null;
            const image = item.storageKey && blob ? { url: await original(item), storageKey: item.storageKey, width: item.width, height: item.height, bytes: blob.size, mimeType: blob.type } : await uploadImage(await original(item));
            addAsset({ kind: "image", title: item.title, coverUrl: image.url, tags: [], note: item.prompt, metadata: { model: item.model }, data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType } });
            message.success("已收藏到图片库");
        } catch (error) { message.error(error instanceof Error ? error.message : "收藏失败"); }
    };
    const send = async (item: GalleryImage) => {
        if (!onInsert) { setSendingPrompt(false); setSending(item); setProjectId(projects[0]?.id || ""); return; }
        setInserting((ids) => [...ids, item.id]);
        try { await onInsert({ kind: "image", title: item.title, dataUrl: await original(item), storageKey: item.storageKey }); message.success("已发送到当前画布"); }
        catch (error) { message.error(error instanceof Error ? error.message : "发送失败"); }
        finally { setInserting((ids) => ids.filter((id) => id !== item.id)); }
    };
    const movePreview = (offset: number) => { if (filtered.length) void view(filtered[(Math.max(0, previewIndex) + offset + filtered.length) % filtered.length]); };
    return <div className={`flex min-h-0 flex-col ${compact ? "h-full px-4 pb-3" : ""}`}>
        <div className="mb-4 flex flex-wrap items-center gap-2">{!compact && <ConfigProvider theme={{ components: { Segmented: { itemSelectedBg: theme.accent.base, itemSelectedColor: theme.node.panel } } }}><Segmented aria-label="提示词筛选" value={withPromptOnly ? "with" : "all"} onChange={(value) => setWithPromptOnly(value === "with")} options={[{ value: "all", label: "全部图片" }, { value: "with", label: "有提示词" }]} /></ConfigProvider>}<Input className="min-w-40 flex-1" aria-label={mode === "history" ? "搜索生成历史" : "搜索收藏图片"} value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Search className="size-4" />} placeholder={mode === "history" ? "搜索图片、提示词或模型" : "搜索收藏图片"} allowClear />{mode === "history" && <Button aria-label="刷新生成历史" type="text" icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()} />}</div>
        {error && mode === "history" && <p role="alert" className="mb-3 text-xs text-red-500">{error}</p>}
        <div className={compact ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""}>
            {!hydrated || !assetReady || (mode === "history" && loading) ? <p className="py-16 text-center text-sm text-muted-foreground">正在读取本地图片…</p> : !filtered.length ? <p className="py-16 text-center text-sm text-muted-foreground">{query ? "没有匹配图片" : mode === "history" ? "还没有生成历史" : "还没有收藏图片，可在生成历史中点击爱心收藏"}</p> : <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${thumbnailSize}px), 1fr))` }}>{filtered.map((item) => <article key={item.id} className={`group min-w-0 overflow-hidden rounded-2xl border ${compact ? "border-border bg-card" : "motion-safe:transition-transform motion-safe:hover:-translate-y-0.5"}`} style={compact ? undefined : canvasGlass(theme)} title={item.prompt || item.title}>
                <div className="relative">
                    <button type="button" aria-label={`预览 ${item.title}`} className="block w-full" onDoubleClick={() => void view(item)} onClick={() => { if (!compact) void view(item); }}><LibraryImage item={item} /></button>
                    {!compact && <>
                        <button type="button" aria-label={favoriteOf(item) ? `取消收藏 ${item.title}` : `收藏 ${item.title}`} className="bf-mag-btn absolute right-2 top-2 grid size-8 place-items-center rounded-full border" style={{ ...canvasGlass(theme), color: favoriteOf(item) ? "#ef4444" : theme.node.text }} onClick={() => void favorite(item)}><Heart className={`size-4 ${favoriteOf(item) ? "fill-current" : ""}`} /></button>
                        <div className="absolute inset-x-2 bottom-2 flex flex-wrap justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                            <button type="button" disabled={!item.prompt.trim()} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs disabled:opacity-50" style={canvasGlass(theme)} onClick={() => { if (mode === "gallery") void copy(item.prompt); else { setSendingPrompt(true); setSending(item); setProjectId(projects[0]?.id || ""); } }}><Copy size={12} />{mode === "history" ? "复用提示词" : "复制提示词"}</button>
                            <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs" style={canvasGlass(theme)} onClick={() => void send(item)}><Send size={12} />{mode === "history" ? "放入画布" : "插入画布"}</button>
                        </div>
                    </>}
                    {compact && <>
                        <button type="button" aria-label={favoriteOf(item) ? `取消收藏 ${item.title}` : `收藏 ${item.title}`} title={favoriteOf(item) ? "取消收藏" : "收藏到图片库"} className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-background/85 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={() => void favorite(item)}><Heart className={`size-3.5 ${favoriteOf(item) ? "fill-current" : ""}`} /></button>
                        <button type="button" aria-label={`发送 ${item.title} 到画布`} title="发送到当前画布" disabled={inserting.includes(item.id)} className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-xl bg-transparent text-white transition-opacity hover:opacity-80 disabled:opacity-40" onClick={() => void send(item)}><Send className="size-5" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }} /></button>
                    </>}
                </div>
                {!compact && <div className="px-3 py-2"><p className="truncate text-sm font-medium">{item.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.model || item.sources.map((source) => source.label).join(" · ")}</p></div>}
            </article>)}</div>}
        </div>
        <div className={`mt-3 flex shrink-0 items-center gap-2 rounded-2xl border border-border px-3 ${compact ? "self-end" : "w-64 self-center"}`}>
            <Grid2X2 className="size-3.5 text-muted-foreground" />
            <Button type="text" size="small" aria-label="缩小图片卡片" disabled={thumbnailSize <= 100} icon={<Minus className="size-3.5" />} onClick={() => setThumbnailSize((value) => Math.max(100, value - 20))} />
            <Slider aria-label="图片卡片大小" className="!m-0 w-24" min={100} max={280} step={20} value={thumbnailSize} onChange={setThumbnailSize} tooltip={{ open: false }} />
            <Button type="text" size="small" aria-label="放大图片卡片" disabled={thumbnailSize >= 280} icon={<Plus className="size-3.5" />} onClick={() => setThumbnailSize((value) => Math.min(280, value + 20))} />
        </div>
        <CanvasImagePreviewDialog dataUrl={previewUrl} title={preview?.title || "原图预览"} open={Boolean(preview)} onClose={() => { previewRequest.current += 1; setPreview(null); }} onPrevious={() => movePreview(-1)} onNext={() => movePreview(1)} position={previewIndex + 1} total={filtered.length} />
        <Modal open={Boolean(sending)} title={sendingPrompt ? "复用提示词到画布" : "发送到画布"} onCancel={() => setSending(null)} confirmLoading={busy} modalRender={(node) => <div data-canvas-overlay data-canvas-no-zoom>{node}</div>} onOk={async () => { if (!sending) return; setBusy(true); try { const id = projectId || useCanvasStore.getState().createProject(); await insertLibraryItem(id, sendingPrompt ? { kind: "text", id: sending.id, title: sending.title || "历史提示词", coverUrl: "", tags: [], createdAt: "", updatedAt: "", data: { content: sending.prompt } } : sending); setSending(null); navigate(`/canvas/${id}`); } catch (error) { message.error(error instanceof Error ? error.message : "发送失败"); } finally { setBusy(false); } }}><Select className="my-4 w-full" aria-label="目标画布" value={projectId} onChange={setProjectId} options={[{ value: "", label: "新建画布" }, ...projects.map((project) => ({ value: project.id, label: project.title }))]} /></Modal>
    </div>;
}

export function LibraryImage({ item }: { item: Pick<GalleryImage, "storageKey" | "url" | "title"> }) {
    const preview = useSyncExternalStore(subscribeImagePreviews, () => previewUrlFor(item.storageKey));
    const [url, setUrl] = useState(""), [loading, setLoading] = useState(true);
    useEffect(() => { let active = true; setUrl(""); setLoading(true); void (async () => { try { const value = await ensureImagePreview(item.storageKey) || await resolveImageUrl(item.storageKey, item.storageKey ? "" : item.url); if (active) setUrl(value); } catch { if (active) setUrl(""); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [item.storageKey, item.url]);
    return <div className="grid aspect-square place-items-center overflow-hidden bg-muted/30">{preview || url ? <img src={preview || url} alt={item.title} loading="lazy" decoding="async" className="size-full object-cover" /> : <span className="p-2 text-center text-xs text-muted-foreground">{loading ? "正在读取图片…" : "图片无法读取"}</span>}</div>;
}