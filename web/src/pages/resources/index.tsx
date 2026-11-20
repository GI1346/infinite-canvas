import { App, Button } from "antd";
import { Database, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ResourceBrowser } from "@/components/library/resource-browser";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { cleanResourceStorage } from "@/services/resource-cleanup";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { readLocalStorageUsage, type LocalStorageUsage } from "@/services/local-storage-usage";
import { useThemeStore } from "@/stores/use-theme-store";

export default function ResourcesPage() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { message, modal } = App.useApp();
    const canvasReady = useCanvasStore((state) => state.hydrated), assetsReady = useAssetStore((state) => state.hydrated);
    const [usage, setUsage] = useState<LocalStorageUsage>();
    const [loading, setLoading] = useState(true), [clearing, setClearing] = useState(false), [error, setError] = useState(false);
    const refresh = useCallback(async (isActive: () => boolean = () => true) => {
        setLoading(true);
        setError(false);
        try { const next = await readLocalStorageUsage(); if (isActive()) setUsage(next); }
        catch { if (isActive()) setError(true); }
        finally { if (isActive()) setLoading(false); }
    }, []);
    useEffect(() => { let active = true; void refresh(() => active); return () => { active = false; }; }, [refresh]);
    const confirmCleanup = () => {
        const { projects } = useCanvasStore.getState();
        const empty = projects.length === 0;
        modal.confirm({
            title: empty ? "确认清空本地创作数据？" : "确认清理未引用的资源？",
            content: <div className="space-y-2">
                <p>{empty ? "当前已无画布项目，本次清理将清空全部本地图片、生成历史、图片库与缓存，同时移除已保存的资源和回收站数据。" : `当前有 ${projects.length} 个画布项目。本次会保留这些画布引用的图片和媒体，删除未引用的文件、历史里的孤立图片、无用预览及回收站数据。`}</p>
                <p>清理后无法恢复。API 中转地址、渠道、Key、已选模型和系统偏好全部保留。</p>
            </div>,
            okText: empty ? "确认清空" : "确认清理",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setClearing(true);
                try { await cleanResourceStorage(projects); window.location.reload(); }
                catch (error) { message.error(error instanceof Error ? error.message : "资源清理失败，请重试"); }
                finally { setClearing(false); }
            },
        });
    };
    const stores = usage?.databases.flatMap((database) => database.stores) ?? [];
    const bytesOf = (name: string) => stores.filter((store) => store.name === name).reduce((sum, store) => sum + store.bytes, 0);
    const segments = [
        { label: "原图", bytes: bytesOf("image_files"), color: theme.accent.base },
        { label: "预览缓存", bytes: bytesOf("image_previews"), color: theme.toolbar.activeText },
        { label: "图库索引", bytes: usage?.databases.reduce((sum, db) => sum + db.galleryIndexBytes, 0) ?? 0, color: theme.node.faint },
    ];
    const measured = segments.reduce((sum, item) => sum + item.bytes, 0);
    const total = Math.max(usage?.usage ?? 0, measured);
    const humanSize = (bytes: number) => formatBytes(bytes) || "0 B";
    return <main className="h-full overflow-y-auto bg-background px-6 py-9 lg:px-12">
        <header className="mb-5"><h1 className="text-3xl font-semibold">资源管理器</h1><p className="mt-2 text-sm text-muted-foreground">保存和复用工作流、提示词</p></header>
        <section aria-label="本地存储空间" className="mb-5 rounded-2xl border p-4" style={canvasGlass(theme)}>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="flex items-center gap-2 text-xs" style={{ color: theme.node.muted }}><Database size={14} />本地存储估算</p><strong key={total} className="bf-digit-roll mt-1 font-mono text-2xl tabular-nums">{loading && !usage ? "读取中…" : !usage ? "—" : humanSize(total)}</strong></div>
                <div className="flex flex-wrap gap-2"><Button size="small" icon={<RefreshCw size={13} />} loading={loading} disabled={clearing} onClick={() => void refresh()}>刷新</Button><Button size="small" icon={<Sparkles size={13} />} loading={clearing} disabled={loading || !canvasReady || !assetsReady} onClick={confirmCleanup}>清理本地资源</Button></div>
            </div>
            {error ? <p role="alert" className="mt-3 text-xs">暂时无法读取本地存储，请重试。</p> : usage && <><div className="mt-3 flex h-2 overflow-hidden rounded-full" aria-hidden="true" style={{ background: theme.node.stroke }}>{segments.map(({ label, bytes, color }) => <span key={label} className="motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${total ? bytes / total * 100 : 0}%`, background: color }} />)}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: theme.node.muted }}>{segments.map((segment) => <span key={segment.label}>{segment.label} <b className="font-mono" style={{ color: theme.node.text }}>{humanSize(segment.bytes)}</b></span>)}{total > measured && <span>其他 {humanSize(total - measured)}</span>}</div></>}
        </section>
        <ResourceBrowser />
    </main>;
}
