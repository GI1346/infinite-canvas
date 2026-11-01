import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, Modal, Pagination, Select } from "antd";
import { Download, FolderOpen, Images, RefreshCw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { saveAs } from "file-saver";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { ensureImagePreview, resolveImageUrl } from "@/services/image-storage";
import { collectGalleryImages, readImageHistory, type GalleryImage, type ImageHistoryLog } from "./gallery-data";

export default function GalleryPage() {
    const { message } = App.useApp(), navigate = useNavigate();
    const theme = canvasThemes[useThemeStore(s => s.theme)];
    const projects = useCanvasStore(s => s.projects), hydrated = useCanvasStore(s => s.hydrated);
    const [logs, setLogs] = useState<ImageHistoryLog[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
    const [query, setQuery] = useState(""), [source, setSource] = useState("all"), [page, setPage] = useState(1), [selectedId, setSelectedId] = useState("");
    const [preview, setPreview] = useState("");
    const refresh = async () => { setLoading(true); setError(""); try { setLogs(await readImageHistory()); } catch { setError("读取生成历史失败，请检查本地存储或重试。现有图片没有被修改。"); } finally { setLoading(false); } };
    useEffect(() => { void refresh(); }, []);
    const all = useMemo(() => collectGalleryImages(projects, logs), [projects, logs]);
    const filtered = useMemo(() => { const q = query.trim().toLocaleLowerCase(); return all.filter(item => (source === "all" || item.sources.some(s => source === "workbench" ? !s.projectId : s.projectId === source)) && [item.title, item.prompt, item.model, ...item.sources.map(s => s.label)].join(" ").toLocaleLowerCase().includes(q)); }, [all, query, source]);
    const selected = filtered.find(item => item.id === selectedId);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 24)));
    const openOriginal = async (item: GalleryImage) => { try { const url = await resolveImageUrl(item.storageKey, item.storageKey ? "" : item.url); if (!url) throw Error(); return url; } catch { message.error("原图不存在或已清理，请在原画布或历史记录中检查。"); return ""; } };
    return <main className="h-full overflow-y-auto" style={{ color: theme.node.text }}>
        <div className="mx-auto max-w-[1600px] px-6 py-10 lg:px-12">
            <header className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold">图片库</h1><p className="mt-2 text-sm" style={{ color: theme.node.muted }}>浏览已有画布与生图工作台中的历史生成图片</p></div><Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>刷新历史</Button></header>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                <Input aria-label="搜索生成图片" placeholder="搜索名称、提示词、模型或画布" prefix={<Search className="size-4" />} className="!w-full sm:!w-80" allowClear value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
                <Select aria-label="图片来源" className="w-48" value={source} onChange={v => { setSource(v); setPage(1); }} options={[{ value: "all", label: "全部来源" }, { value: "workbench", label: "生图工作台" }, ...projects.map(p => ({ value: p.id, label: p.title }))]} />
                <span className="ml-auto text-xs" style={{ color: theme.node.muted }}>{filtered.length} 张图片</span>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                <section className="min-w-0">
                    {loading || !hydrated ? <div className="py-24 text-center">正在读取历史图片…</div> : !filtered.length ? <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed p-8 text-center" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}><Images className="mb-4 size-10 opacity-60" /><h2 className="font-semibold">{all.length ? "没有匹配的图片" : "还没有生成图片"}</h2><p className="mt-3 max-w-md text-sm">图片来自本机已有的画布产物和工作台生成历史；导入的参考图不会混入。已删除或清理的图片不会被恢复。</p></div> : <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                        {filtered.slice((currentPage - 1) * 24, currentPage * 24).map(item => <button key={item.id} type="button" aria-label={item.title} aria-pressed={selectedId === item.id} className="overflow-hidden rounded-2xl border text-left transition hover:shadow-md" style={{ overflow: "hidden", background: theme.node.panel, borderColor: selectedId === item.id ? theme.node.activeStroke : theme.node.stroke }} onClick={() => setSelectedId(item.id)}><GalleryThumbnail item={item} /><div className="p-3"><h2 className="truncate text-sm font-medium">{item.title}</h2><p className="mt-1 truncate text-xs" style={{ color: theme.node.muted }}>{item.sources.map(s => s.label).join(" / ")}</p><p className="mt-1 text-xs" style={{ color: theme.node.faint }}>{item.width || "?"} × {item.height || "?"}</p></div></button>)}
                    </div>}
                    <Pagination className="mt-6" current={currentPage} pageSize={24} total={filtered.length} onChange={setPage} showSizeChanger={false} hideOnSinglePage />
                </section>
                <aside className="h-fit rounded-2xl border p-5 xl:sticky xl:top-5" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                    {!selected ? <div className="py-20 text-center text-sm" style={{ color: theme.node.muted }}>选择一张图片查看信息</div> : <><GalleryThumbnail key={selected.id} item={selected} /><h2 className="mt-4 break-words font-semibold">{selected.title}</h2><dl className="mt-3 space-y-2 break-words text-xs" style={{ color: theme.node.muted }}><div>来源：{selected.sources.map(s => s.label).join(" / ")}</div><div>模型：{selected.model || "未记录"}</div><div>尺寸：{selected.width || "?"} × {selected.height || "?"}</div><div>质量：{selected.quality || "未记录"}</div><div>{selected.sources.some(s => s.projectId) ? "画布更新时间" : "生成时间"}：{selected.date ? new Date(selected.date).toLocaleString() : "未记录"}</div></dl><p className="mt-4 max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm">{selected.prompt || "未记录提示词"}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={async () => { const url = await openOriginal(selected); if (url) setPreview(url); }}>查看原图</Button><Button icon={<Download className="size-4" />} onClick={async () => { const url = await openOriginal(selected); if (url) saveAs(url, selected.title + ".png"); }}>下载</Button>{selected.sources.filter(s => s.projectId).map(s => <Button key={s.projectId + ":" + s.nodeId} icon={<FolderOpen className="size-4" />} onClick={() => navigate("/canvas/" + s.projectId)}>打开 {s.label}</Button>)}</div></>}
                </aside>
            </div>
        </div>
        <Modal title="原图预览" open={Boolean(preview)} onCancel={() => setPreview("")} footer={null} width="90vw" centered><img src={preview || undefined} alt="生成图片原图" className="mx-auto max-h-[80vh] max-w-full object-contain" /></Modal>
    </main>;
}

function GalleryThumbnail({ item }: { item: GalleryImage }) {
    const [url, setUrl] = useState(""), [failed, setFailed] = useState(false);
    useEffect(() => { let active = true; setFailed(false); setUrl(""); void (async () => { try { const value = await ensureImagePreview(item.storageKey) || await resolveImageUrl(item.storageKey, item.storageKey ? "" : item.url); if (active) { setUrl(value); setFailed(!value); } } catch { if (active) setFailed(true); } })(); return () => { active = false; }; }, [item.storageKey, item.url]);
    return <div className="flex aspect-square items-center justify-center overflow-hidden bg-black/5 dark:bg-white/5">{url && !failed ? <img src={url} alt={item.title} loading="lazy" className="size-full object-contain" onError={() => setFailed(true)} /> : <span className="p-3 text-center text-xs opacity-60">{failed ? "图片已清理或无法读取" : "加载缩略图…"}</span>}</div>;
}
