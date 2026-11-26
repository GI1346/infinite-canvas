import { App } from "antd";
import { createPortal } from "react-dom";
import { ChevronDown, Maximize2, Minimize2, Plus, Upload } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { uploadImage } from "@/services/image-storage";
import type { GalleryImage } from "@/pages/gallery/gallery-data";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { isImeComposing } from "@/lib/keyboard-event";

export function CanvasGenerationEditorModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
    const [mounted, setMounted] = useState(open), [visible, setVisible] = useState(false);
    const panel = useRef<HTMLDivElement>(null), opener = useRef<HTMLElement | null>(null);
    const titleId = useId();

    useLayoutEffect(() => {
        if (open) {
            if (!mounted) {
                opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                setMounted(true);
                return;
            }
            let revealFrame = 0;
            // Paint the hidden portal before revealing the solid card.
            const firstFrame = requestAnimationFrame(() => { revealFrame = requestAnimationFrame(() => setVisible(true)); });
            return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(revealFrame); };
        }
        if (!mounted) return;
        const remove = window.setTimeout(() => {
            setVisible(false);
            setMounted(false);
            opener.current?.focus({ preventScroll: true });
            opener.current = null;
        }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
        return () => window.clearTimeout(remove);
    }, [open, mounted]);

    useLayoutEffect(() => {
        if (!visible || !open) return;
        // The shared composer uses contenteditable for @ chips; focus it the same way as a textarea.
        (panel.current?.querySelector<HTMLElement>("textarea, [contenteditable='true'][role='textbox']") ?? panel.current)?.focus({ preventScroll: true });
    }, [open, visible]);

    if (!mounted) return null;
    return createPortal(
        <div data-generation-expanded data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore className="fixed inset-0 z-[1040] grid place-items-center overflow-auto"
            onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                event.stopPropagation();
                // Menus and image pickers have their own portalled Escape handling.
                if (open && event.key === "Escape" && !event.defaultPrevented && !isImeComposing(event) && event.currentTarget.contains(event.target as Node)) {
                    event.preventDefault(); onClose();
                }
            }}>
            <div aria-hidden="true" data-generation-backdrop className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ease-out motion-reduce:transition-none ${visible && open ? "opacity-100" : "opacity-0"}`} onClick={() => { if (open) onClose(); }} />
            <div ref={panel} data-generation-card role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} inert={!open}
                className={`relative w-[min(1000px,94vw)] rounded-[20px] bg-white shadow-2xl outline-none transition-[transform] duration-200 ease-out will-change-transform motion-reduce:transition-none dark:bg-[#14171c] ${visible ? "visible" : "invisible"} ${visible && open ? "[transform:scale(1)]" : "[transform:scale(.95)]"}`}>
                <span id={titleId} className="sr-only">生成配置 · 放大编辑</span>
                {children}
            </div>
        </div>,
        document.body,
    );
}

const composerInputChrome = "rounded-2xl border transition-colors focus-within:!border-[#0ea977]/60 focus-within:ring-2 focus-within:ring-[#0ea977]/15";
export const composerInputSurface = `${composerInputChrome} bg-black/[0.025] dark:bg-white/[0.04]`;
export const expandedComposerInputSurface = `${composerInputChrome} bg-[#f6f7f9] dark:bg-[#1a1e24]`;

export function GenerationReferenceHeader({ theme, count, expanded, collapsed, onSelect, onAddImage, onExpand, onCollapse, onClose }: {
    theme: CanvasTheme; count: number; expanded: boolean; collapsed?: boolean; onSelect?: () => void; onAddImage?: (image: GalleryImage) => Promise<unknown>;
    onExpand: () => void; onCollapse: () => void; onClose: () => void;
}) {
    const action = "grid size-7 shrink-0 place-items-center rounded-lg hover:opacity-70";
    const fileInput = useRef<HTMLInputElement>(null), [uploading, setUploading] = useState(false);
    const { message } = App.useApp();
    const addFiles = async (files: File[]) => {
        if (!onAddImage || uploading || !files.length) return;
        setUploading(true);
        try {
            for (const file of files) {
                if (!file.type.startsWith("image/")) continue;
                const image = await uploadImage(file);
                await onAddImage({ id: image.storageKey || image.url, title: file.name, url: image.url, storageKey: image.storageKey, width: image.width, height: image.height, date: Date.now(), prompt: "", model: "", quality: "", sources: [{ label: "上传图片" }] });
            }
        } catch (error) { message.error(error instanceof Error ? error.message : "无法上传参考图"); }
        finally { setUploading(false); }
    };
    return <div data-canvas-no-zoom className="flex min-w-0 shrink-0 items-center gap-1.5" onMouseDown={(event) => event.stopPropagation()}>
        {onSelect && <button type="button" className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-1.5 text-[11px] hover:opacity-70" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }} title="从画布选择参考节点" onClick={onSelect}>
            <Plus size={12} />参考图{count ? <span className="tabular-nums">({count})</span> : null}
        </button>}
        {expanded && onAddImage && <>
            <button type="button" aria-label="上传参考图" title="上传参考图" disabled={uploading} className={`${action} disabled:opacity-40`} onClick={() => fileInput.current?.click()}><Upload size={14} /></button>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; void addFiles(files); }} />
        </>}
        {expanded && <span className="truncate text-xs font-semibold">生成配置 · 放大编辑</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
            {expanded ? <><span className="text-[11px]" style={{ color: theme.node.muted }}>Esc 退出</span><button type="button" aria-label="还原生成配置" title="还原编辑" className={action} onClick={onClose}><Minimize2 size={14} /></button></> : <>
                <button type="button" aria-label={collapsed ? "展开生成配置" : "收起生成配置"} aria-expanded={!collapsed} className={action} onClick={onCollapse}><ChevronDown size={14} className={collapsed ? "rotate-180" : ""} /></button>
                <button type="button" aria-label="放大编辑生成配置" title="放大编辑" className={action} onClick={onExpand}><Maximize2 size={14} /></button>
            </>}
        </div>
    </div>;
}
