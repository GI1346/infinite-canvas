import { wheelZoomFactor } from "@/stores/use-canvas-navigation-store";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Modal } from "antd";
import { ChevronLeft, ChevronRight, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type View = { x: number; y: number; k: number };
const fitted: View = { x: 0, y: 0, k: 1 };

export function CanvasImagePreviewDialog({ dataUrl, title, open, onClose, onPrevious, onNext, position, total, images = [], onSelect }: { dataUrl: string; title: string; open: boolean; onClose: () => void; onPrevious?: () => void; onNext?: () => void; position?: number; total?: number; images?: { id: string; content: string; title?: string }[]; onSelect?: (index: number) => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const thumbnailStripRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [image, setImage] = useState({ width: 0, height: 0 });
    const [failed, setFailed] = useState(false);
    const [view, setView] = useState(fitted);
    const viewRef = useRef(view);
    const pan = useRef<{ id: number; x: number; y: number } | null>(null);
    const [panning, setPanning] = useState(false);
    const change = useCallback((next: View) => { viewRef.current = next; setView(next); }, []);
    const endPan = useCallback(() => {
        const pointer = pan.current;
        pan.current = null;
        if (pointer && viewport?.hasPointerCapture(pointer.id)) viewport.releasePointerCapture(pointer.id);
        setPanning(false);
    }, [viewport]);
    const reset = useCallback(() => { endPan(); change(fitted); }, [change, endPan]);

    useLayoutEffect(() => {
        change(fitted); pan.current = null; setPanning(false); setFailed(false);
        const img = imageRef.current;
        setImage({ width: img?.complete ? img.naturalWidth : 0, height: img?.complete ? img.naturalHeight : 0 });
    }, [dataUrl, open, change]);
    useLayoutEffect(() => {
        if (!open || !viewport) return;
        const measure = () => {
            setSize({ width: viewport.clientWidth, height: viewport.clientHeight });
            reset();
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [open, viewport, reset]);
    useEffect(() => {
        if (!open) return;
        window.addEventListener("blur", endPan);
        return () => { window.removeEventListener("blur", endPan); endPan(); };
    }, [open, endPan]);

    useEffect(() => {
        if (!open) return;
        const navigate = (event: KeyboardEvent) => {
            if (event.isComposing || (event.target instanceof Element && event.target.closest("input,textarea,[contenteditable=true]"))) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (event.key === "ArrowLeft") onPrevious?.();
            else onNext?.();
        };
        window.addEventListener("keydown", navigate, true);
        return () => window.removeEventListener("keydown", navigate, true);
    }, [open, onPrevious, onNext]);

    useLayoutEffect(() => {
        if (!open) return;
        const strip = thumbnailStripRef.current;
        const selected = strip?.querySelector<HTMLButtonElement>('[aria-current="true"]');
        if (!strip || !selected) return;
        const left = selected.offsetLeft;
        const right = left + selected.offsetWidth;
        if (left < strip.scrollLeft) strip.scrollLeft = left;
        else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    }, [open, position, images.length, size.width]);

    const ready = image.width > 0 && image.height > 0 && size.width > 0 && size.height > 0;
    const fit = ready ? Math.min(size.width / image.width, size.height / image.height, 1) : 0;
    const zoom = useCallback((factor: number, clientX?: number, clientY?: number) => {
        if (!viewport || !ready) return;
        const current = viewRef.current;
        // Same scale bounds and wheel curve as the main canvas.
        const k = Math.min(5, Math.max(0.05, current.k * factor));
        const rect = viewport.getBoundingClientRect();
        const x = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
        const y = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
        change({ x: x - (x - current.x) * k / current.k, y: y - (y - current.y) * k / current.k, k });
    }, [viewport, ready, change]);
    useEffect(() => {
        if (!open || !viewport) return;
        const wheel = (event: WheelEvent) => {
            event.preventDefault(); event.stopPropagation();
            if (event.deltaY) zoom(wheelZoomFactor(event.deltaY), event.clientX, event.clientY);
        };
        viewport.addEventListener("wheel", wheel, { passive: false });
        return () => viewport.removeEventListener("wheel", wheel);
    }, [open, viewport, zoom]);

    const start = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !ready) return;
        event.preventDefault(); event.stopPropagation();
        pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId); setPanning(true);
    };
    const move = (event: ReactPointerEvent<HTMLDivElement>) => {
        const previous = pan.current;
        if (!previous || previous.id !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        const current = viewRef.current;
        change({ ...current, x: current.x + event.clientX - previous.x, y: current.y + event.clientY - previous.y });
        pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    return <Modal title={<div className="flex min-w-0 items-center gap-4 pr-8"><span className="truncate">{title || t("canvas.projectPage.imageDetails")}</span>{total ? <span className="shrink-0 text-sm font-normal opacity-60">{position} / {total}</span> : null}</div>} open={open} onCancel={onClose} footer={null} width="100vw" style={{ top: 0, margin: 0, maxWidth: "none", paddingBottom: 0 }} styles={{ container: { height: "100dvh", borderRadius: 0, background: theme.canvas.background, color: theme.node.text, display: "flex", flexDirection: "column" }, header: { background: theme.canvas.background, color: theme.node.text }, body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } }} destroyOnHidden
        modalRender={(modal) => <div data-canvas-overlay data-canvas-no-zoom onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>{modal}</div>}>
        <div ref={setViewport} data-image-preview-viewport className="relative min-h-0 w-full flex-1 overflow-hidden select-none" style={{ background: theme.canvas.background, touchAction: "none", cursor: panning ? "grabbing" : "grab" }}
            onPointerDown={start} onPointerMove={move} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan} onDragStart={(event) => event.preventDefault()}>
            <img ref={imageRef} src={dataUrl} alt={title} draggable={false} data-image-preview-media className="pointer-events-none absolute max-w-none" onLoad={(event) => setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailed(true)}
                style={{ left: "50%", top: "50%", width: image.width * fit, height: image.height * fit, visibility: ready && !failed ? "visible" : "hidden", transform: `translate(${view.x}px, ${view.y}px) translate(-50%, -50%) scale(${view.k})`, transformOrigin: "center" }} />
            {failed ? <div role="alert" className="absolute inset-0 flex items-center justify-center text-sm">图片加载失败，请关闭后重试</div> : null}
        </div>
        {(total || 0) > 1 ? <>
            <Button className="!fixed left-4 top-1/2 z-10" shape="circle" size="large" aria-label="上一张图片" disabled={!onPrevious} icon={<ChevronLeft />} onClick={onPrevious} />
            <Button className="!fixed right-4 top-1/2 z-10" shape="circle" size="large" aria-label="下一张图片" disabled={!onNext} icon={<ChevronRight />} onClick={onNext} />
        </> : null}
        <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-2">
            <Button type="text" aria-label="缩小预览图片" disabled={!ready || view.k <= 0.05} icon={<ZoomOut size={16} />} onClick={() => zoom(1 / 1.1)} />
            <span data-image-preview-scale className="min-w-14 text-center text-xs tabular-nums">{Math.round(fit * view.k * 100)}%</span>
            <Button type="text" aria-label="放大预览图片" disabled={!ready || view.k >= 5} icon={<ZoomIn size={16} />} onClick={() => zoom(1.1)} />
            <Button type="text" icon={<Maximize size={16} />} onClick={reset}>适应窗口</Button>
            <span data-image-resolution className="text-xs tabular-nums">{image.width > 0 && image.height > 0 ? `${image.width} × ${image.height} px` : ""}</span>
            <span className="text-xs opacity-60">滚轮缩放 · 左键拖动</span>
        </div>
        {images.length > 0 && onSelect ? <nav aria-label="画布图片缩略图" className="mt-3 min-w-0 shrink-0">
            <div ref={thumbnailStripRef} data-image-preview-thumbnails className="relative flex max-w-full gap-2 overflow-x-auto overscroll-x-contain py-1" style={{ scrollbarWidth: "thin" }}>
                {images.map((item, index) => <button key={item.id} type="button" aria-label={`查看第 ${index + 1} 张图片：${item.title || "图片"}`} aria-current={index === (position || 1) - 1 ? "true" : undefined} title={item.title || `图片 ${index + 1}`} onClick={() => onSelect(index)}
                    className="h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 p-0.5 focus-visible:outline-2 focus-visible:outline-offset-1"
                    style={{ background: index === (position || 1) - 1 ? theme.toolbar.activeBg : theme.node.panel, borderColor: index === (position || 1) - 1 ? theme.node.activeStroke : theme.node.stroke, outlineColor: theme.node.activeStroke }}>
                    <img src={item.content} alt="" draggable={false} loading="lazy" decoding="async" className="h-full w-full object-contain" />
                </button>)}
            </div>
        </nav> : null}
    </Modal>;
}
