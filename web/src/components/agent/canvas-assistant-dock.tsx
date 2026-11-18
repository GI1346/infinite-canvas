import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Minus } from "lucide-react";

import { HarnessSidebarPane } from "@/components/agent/harness-sidebar-pane";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { clampAssistantWindow } from "@/lib/canvas/assistant-dock-layout";
import { useCanvasAssistantStore } from "@/stores/use-canvas-assistant-store";
import { useThemeStore } from "@/stores/use-theme-store";

const sidebarWidthKey = "blinkflow:canvas-assistant-sidebar-width";
const sidebarWidth = (width: number) => clampAssistantWindow({ x: 8, y: 8, width, height: 240 }, viewport()).width;
function initialSidebarWidth() {
    try { const width = Number(localStorage.getItem(sidebarWidthKey)); if (Number.isFinite(width) && width > 0) return sidebarWidth(width); } catch { /* UI preference only. */ }
    return sidebarWidth(420);
}
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
const stop = (event: { stopPropagation(): void }) => event.stopPropagation();
const button = "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40";

/** DeepSeek Harness 专用悬浮面板：只承载官方 Harness 的 iframe 与面板外壳。 */
export function CanvasAssistantDock() {
    const store = useCanvasAssistantStore();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [width, setWidth] = useState(initialSidebarWidth);
    const widthRef = useRef(width);
    widthRef.current = width;
    const dragCleanup = useRef<(() => void) | null>(null);

    useEffect(() => {
        const resize = () => setWidth(sidebarWidth(widthRef.current));
        window.addEventListener("resize", resize);
        return () => { window.removeEventListener("resize", resize); dragCleanup.current?.(); };
    }, []);

    const resizeWindow = (event: ReactPointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); dragCleanup.current?.();
        const startX = event.clientX, startWidth = widthRef.current;
        const onMove = (next: PointerEvent) => { widthRef.current = sidebarWidth(startWidth - (next.clientX - startX)); setWidth(widthRef.current); };
        const finish = () => {
            window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); dragCleanup.current = null;
            try { localStorage.setItem(sidebarWidthKey, String(widthRef.current)); } catch { /* Optional layout preference. */ }
        };
        dragCleanup.current = finish; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
    };

    if (!store.context) return null;
    const panelStyle: CSSProperties = { position: "absolute", top: 76, right: 10, bottom: 20, left: 0, width: "auto", height: "auto", border: "1px solid", color: theme.node.text, ...canvasGlass(theme) };
    return <div data-canvas-overlay data-canvas-no-zoom data-canvas-assistant className="pointer-events-none fixed right-0 top-0 h-full shrink-0" style={{ width: store.open ? width : 0, zIndex: 240 }} onPointerDown={stop} onMouseDown={stop} onDoubleClick={stop} onContextMenu={stop} onKeyDown={stop} onKeyUp={stop} onWheel={stop}>
        <section data-assistant-panel data-canvas-overlay data-canvas-no-zoom role="dialog" aria-label="DeepSeek Harness 右侧面板" style={{ ...panelStyle, display: store.open ? "flex" : "none" }} className="pointer-events-auto flex-col overflow-hidden rounded-[26px]">
            <header data-assistant-header className="flex shrink-0 items-center gap-1 border-b px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                <span data-assistant-title className="mr-auto inline-flex min-w-0 items-center gap-1.5 px-1.5 text-xs font-semibold" style={{ color: theme.accent.base }}>
                    <img src="/icons/deepseek.svg" alt="" className="size-4" />
                    DeepSeek Harness
                </span>
                <button type="button" className={button} aria-label="收起面板" title="收起（任务继续）" onClick={() => store.setOpen(false)}><Minus size={16} /></button>
            </header>
            <HarnessSidebarPane />
            <div data-assistant-sidebar-resize data-assistant-resize="w" role="separator" aria-label="调整面板宽度" aria-orientation="vertical" style={{ position: "absolute", left: -3, top: 0, bottom: 0, width: 7, zIndex: 5, cursor: "col-resize", touchAction: "none" }} onPointerDown={resizeWindow} />
        </section>
    </div>;
}
