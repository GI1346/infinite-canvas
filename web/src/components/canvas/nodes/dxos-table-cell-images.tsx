import { useRef, type PointerEvent, type ReactNode } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { DxCellImageItem } from "@/lib/canvas/dxos-table";
import { previewUrlFor } from "@/services/image-storage";

const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

export function TableCellImages({ cellKey, images, theme, onRemove, onPreview, onFiles, onImagePointerDown, className, children }: {
    cellKey: string; images: DxCellImageItem[]; theme: CanvasTheme; onRemove: (id: string) => void;
    onPreview: (image: DxCellImageItem) => void; onFiles: (files: File[]) => void;
    onImagePointerDown?: (event: PointerEvent<HTMLButtonElement>, image: DxCellImageItem) => void;
    className?: string; children: ReactNode;
}) {
    const input = useRef<HTMLInputElement>(null);
    return <div data-table-image-cell={cellKey} className={`group/cell relative ${className || "h-full"}`} onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }
    }} onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
        if (files.length) { event.preventDefault(); event.stopPropagation(); onFiles(files); }
    }}>
        <div className="relative flex shrink-0 flex-wrap items-start gap-1.5 pr-7">
            {images.map((image, index) => <div key={image.nodeId} data-table-cell-image data-node-no-drag className="group/image relative overflow-hidden rounded-lg border transition data-[table-image-dragging]:scale-95 data-[table-image-dragging]:opacity-40" style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }} onPointerDown={stop} onMouseDown={stop}>
                <button type="button" title={onImagePointerDown ? `${image.title} · 上下拖动排序` : image.title} draggable={false} aria-label={`预览 ${image.title}`} onMouseDown={stop} onPointerDown={onImagePointerDown ? (event) => onImagePointerDown(event, image) : undefined} onClick={(event) => { stop(event); onPreview(image); }} className={`block transition-transform hover:scale-[1.03] ${onImagePointerDown ? "touch-none cursor-grab" : "cursor-zoom-in"}`}>
                    <img className={images.length > 1 ? "size-16 object-cover" : "max-h-28 max-w-36 object-contain"} src={previewUrlFor(image.storageKey) || image.url} alt={image.title} decoding="async" draggable={false} />
                    {images.length > 1 && <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 font-mono text-[10px] leading-tight text-white">{index + 1}</span>}
                    {onImagePointerDown && <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-black/45 p-0.5 text-white opacity-0 transition-opacity group-hover/image:opacity-90"><GripVertical className="size-2.5" /></span>}
                </button>
                {image.localId && <button type="button" aria-label={`移除 ${image.title}`} draggable={false} onMouseDown={stop} onClick={(event) => { stop(event); onRemove(image.localId!); }} className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full opacity-0 transition-opacity group-hover/image:opacity-100 focus-visible:opacity-100" style={{ background: theme.toolbar.panel, color: theme.node.text }}><X className="size-2.5" /></button>}
            </div>)}
            <input ref={input} hidden type="file" multiple accept="image/*" onChange={(event) => { onFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ""; }} />
            <button type="button" data-table-cell-image draggable={false} aria-label="添加单元格图片" title="添加图片，也可拖入本地图片" onMouseDown={stop} onClick={() => input.current?.click()} className="absolute right-0 top-0 z-10 grid size-6 place-items-center rounded-lg border border-dashed opacity-0 transition-opacity group-hover/cell:opacity-100 focus-visible:opacity-100 hover:opacity-100" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted }}><Plus className="size-3.5" /></button>
        </div>
        {children}
    </div>;
}
