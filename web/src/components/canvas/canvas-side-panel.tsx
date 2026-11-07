import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { History, Images, Library, X } from "lucide-react";
import { motion } from "motion/react";

import { ImageLibraryBrowser } from "@/components/library/image-library";
import { ResourceBrowser } from "@/components/library/resource-browser";
import type { SavedWorkflow } from "@/components/library/library-data";
import { canvasThemes } from "@/lib/canvas-theme";
import { CANVAS_SIDE_PANEL_MAX_WIDTH, CANVAS_SIDE_PANEL_MIN_WIDTH, CANVAS_SIDE_PANEL_MOTION_MS, useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import type { InsertAssetPayload } from "./asset-picker-modal";

type Props = {
    nodes: CanvasNodeData[];
    connections?: CanvasConnection[];
    selectedNodeIds: Set<string>;
    onInsertAsset: (payload: InsertAssetPayload) => void | Promise<void>;
    onInsertWorkflow?: (workflow: SavedWorkflow) => void | Promise<void>;
};

const PANEL_INFO = {
    history: { title: "生成历史", Icon: History },
    resources: { title: "资源管理器", Icon: Library },
    gallery: { title: "图片库", Icon: Images },
};

export const CanvasSidePanel = memo(function CanvasSidePanel({ nodes, connections = [], selectedNodeIds, onInsertAsset, onInsertWorkflow }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { tab, width, panelMounted, panelClosing, setWidth, closePanel } = useCanvasSidePanelStore();
    const [resizing, setResizing] = useState(false);
    const resizeCleanup = useRef<(() => void) | null>(null);
    useEffect(() => () => resizeCleanup.current?.(), []);

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        resizeCleanup.current?.();
        const startX = event.clientX;
        let nextWidth = width;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, width + moveEvent.clientX - startX));
            setWidth(nextWidth);
        };
        const cleanup = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            resizeCleanup.current = null;
        };
        const onUp = () => {
            localStorage.setItem("canvas-side-panel-width", String(nextWidth));
            cleanup();
            setResizing(false);
        };
        resizeCleanup.current = cleanup;
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    };

    if (!panelMounted) return null;
    const { title, Icon } = PANEL_INFO[tab];
    return (
        <motion.aside
            className="absolute bottom-4 left-20 top-20 z-[160] flex min-h-0 flex-col overflow-hidden rounded-[28px] border"
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: panelClosing ? -24 : 0, opacity: panelClosing ? 0 : 1 }}
            transition={{ duration: CANVAS_SIDE_PANEL_MOTION_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
            style={{ width, maxWidth: "calc(100% - 96px)", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text, boxShadow: theme.toolbar.shadow, pointerEvents: panelClosing ? "none" : undefined }}
            role="dialog"
            aria-label={title}
            data-canvas-library-panel={tab}
            data-canvas-overlay
            data-canvas-no-zoom
        >
            <header className="mb-4 flex shrink-0 items-center gap-2 border-b px-5 py-4" style={{ borderColor: theme.toolbar.border }}>
                <Icon className="size-4" style={{ color: theme.toolbar.activeText }} />
                <h2 className="m-0 flex-1 text-base font-semibold">{title}</h2>
                <button type="button" aria-label={`收起${title}`} className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={closePanel}><X className="size-4" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">
                {tab === "resources" ? <ResourceBrowser compact onInsert={onInsertAsset} onInsertWorkflow={onInsertWorkflow} nodes={selectedNodeIds.size ? nodes.filter((node) => selectedNodeIds.has(node.id)) : nodes} connections={connections} /> : <ImageLibraryBrowser key={tab} compact mode={tab === "history" ? "history" : "gallery"} onInsert={onInsertAsset} />}
            </div>
            <button type="button" className="absolute inset-y-6 right-0 z-40 w-2 cursor-col-resize" onPointerDown={startResize} aria-label="调整悬浮窗口宽度" aria-pressed={resizing} />
        </motion.aside>
    );
});
