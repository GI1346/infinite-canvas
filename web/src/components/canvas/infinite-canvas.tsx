import { wheelZoomFactor } from "@/stores/use-canvas-navigation-store";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { CanvasNodeBurstLayer } from "./canvas-node-burst-layer";
import { gridMetrics } from "@/lib/canvas/canvas-grid";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "@/types/canvas";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    tool: "select" | "pan";
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onCanvasContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onConnectionCutStart?: (event: React.PointerEvent<HTMLDivElement>) => boolean;
    isCuttingConnections?: boolean;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function InfiniteCanvas({ containerRef, viewport, tool, onViewportChange, onCanvasMouseDown, onCanvasDeselect, onCanvasContextMenu, onConnectionCutStart, isCuttingConnections = false, onDrop, children }: InfiniteCanvasProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const background = useThemeStore((state) => state.canvasBackgrounds[colorTheme]) || theme.canvas.background;
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
        startedOnBackground: false,
    });
    const spaceRef = useRef(false);
    const typingSpaceRef = useRef(false);
    const suppressClickRef = useRef(false);
    const cuttingRef = useRef(isCuttingConnections);
    cuttingRef.current = isCuttingConnections;
    const viewportRef = useRef(viewport);
    const paintedRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const committedRef = useRef(viewport);
    const callbacks = useRef({ onViewportChange, onCanvasDeselect });
    callbacks.current = { onViewportChange, onCanvasDeselect };
    const paint = (next: ViewportTransform) => {
        if (paintedRef.current) { paintedRef.current.style.left = `${next.x}px`; paintedRef.current.style.top = `${next.y}px`; }
        if (worldRef.current) worldRef.current.style.zoom = String(next.k);
        const grid = gridRef.current?.firstElementChild as HTMLElement | null;
        if (grid) {
            const { size, opacity } = gridMetrics(next.k);
            grid.style.backgroundSize = `${size}px ${size}px`;
            grid.style.backgroundPosition = `${next.x % size}px ${next.y % size}px`;
            grid.style.opacity = String(opacity);
        }
    };
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const wheelCommitRef = useRef(false);
    const scheduleFrame = () => {
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            const next = nextViewportRef.current;
            nextViewportRef.current = null;
            if (!next) return;
            viewportRef.current = next; paint(next);
            const previous = committedRef.current;
            if (wheelCommitRef.current || Math.abs(next.x - previous.x) / next.k >= 256 || Math.abs(next.y - previous.y) / next.k >= 256) {
                committedRef.current = next; callbacks.current.onViewportChange(next);
            }
            wheelCommitRef.current = false;
        });
    };
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    // 切断连线改成 Ctrl+Alt 一起按：单独按 Ctrl 太容易在缩放、框选时误触。
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const [isAltPressed, setIsAltPressed] = useState(false);
    const cutReady = (isCtrlPressed && isAltPressed) || isCuttingConnections;

    useLayoutEffect(() => {
        if (panState.current.isPanning) return;
        // An unrelated render must not rewind a queued wheel frame; an explicit viewport jump cancels it.
        if (nextViewportRef.current && viewport === committedRef.current) return;
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null; nextViewportRef.current = null; wheelCommitRef.current = false;
        viewportRef.current = viewport;
        committedRef.current = viewport;
        paint(viewport);
    }, [viewport]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        },
        [],
    );

    useEffect(() => {
        const isTextEditing = (target: EventTarget | null) => {
            if (!(target instanceof Element)) return false;
            const input = target.closest("input");
            if (input instanceof HTMLInputElement) return !input.readOnly && !input.disabled && !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(input.type);
            const textarea = target.closest("textarea");
            if (textarea instanceof HTMLTextAreaElement) return !textarea.readOnly && !textarea.disabled;
            const editable = target.closest("[contenteditable]");
            return Boolean(editable && editable.getAttribute("contenteditable") !== "false");
        };
        const isCanvasKeyTarget = (target: EventTarget | null) => {
            if (!(target instanceof Element)) return true;
            if (target.closest(".ant-modal") || Array.from(document.querySelectorAll<HTMLElement>(".ant-modal-wrap")).some((modal) => getComputedStyle(modal).display !== "none")) return false; // Modal gestures still own repeats/keyup after a focused button is blurred.
            return containerRef.current?.parentElement?.contains(target) || target === document.body || target === document.documentElement || Boolean(target.closest("[data-canvas-overlay],[data-canvas-no-zoom],.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown,[data-connection-create-menu]"));
        };
        const captureSpace = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation(); // Stop native button activation and other global shortcut listeners, including repeats/keyup.
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Control") setIsCtrlPressed(true);
            if (event.key === "Alt") setIsAltPressed(true);
            if (event.code !== "Space" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || (!spaceRef.current && !isCanvasKeyTarget(event.target))) return;
            if (isTextEditing(event.target) || isTextEditing(document.activeElement)) {
                spaceRef.current = false; typingSpaceRef.current = false; setIsSpacePressed(false);
                return;
            }
            captureSpace(event);
            if (spaceRef.current) return;
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            spaceRef.current = true;
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === "Control") setIsCtrlPressed(false);
            if (event.key === "Alt") setIsAltPressed(false);
            if (event.code !== "Space") return;
            if (spaceRef.current) captureSpace(event);
            typingSpaceRef.current = false;
            spaceRef.current = false;
            setIsSpacePressed(false);
        };

        const handleBlur = () => {
            setIsCtrlPressed(false);
            setIsAltPressed(false);
            const wasPanning = panState.current.isPanning;
            const hadWheelFrame = wheelCommitRef.current;
            spaceRef.current = false;
            typingSpaceRef.current = false;
            setIsSpacePressed(false);
            panState.current.isPanning = false;
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            frameRef.current = null; wheelCommitRef.current = false;
            const next = nextViewportRef.current || viewportRef.current;
            nextViewportRef.current = null; viewportRef.current = next; committedRef.current = next; paint(next);
            if (wasPanning || hadWheelFrame) callbacks.current.onViewportChange(next);
            setIsPanning(false);
            document.body.style.cursor = "";
        };

        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("keyup", handleKeyUp, true);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("keyup", handleKeyUp, true);
            window.removeEventListener("blur", handleBlur);
        };
    }, [containerRef]);

    const handleWheel = (event: WheelEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        // antd 的弹窗 / 下拉 / 气泡自己滚动。
        if (target?.closest(".ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;
        // 画布上的固定浮层（顶部栏、左侧栏、右键菜单）不抢滚轮；节点内部（含文本节点卡片）一律放行给画布。
        const overlay = target?.closest("[data-canvas-overlay],[data-canvas-no-zoom]");
        if (overlay && !overlay.closest("[data-node-id],[data-node-panel]")) return;

        if (cuttingRef.current) { event.preventDefault(); event.stopPropagation(); return; }

        const current = nextViewportRef.current || viewportRef.current;
        const commit = (next: typeof current) => {
            if (panState.current.isPanning) {
                panState.current.initialX += next.x - current.x;
                panState.current.initialY += next.y - current.y;
            }
            viewportRef.current = next; nextViewportRef.current = next; wheelCommitRef.current = true;
            scheduleFrame();
        };

        // Ctrl / Cmd + 滚轮：无论光标停在面板哪个位置，都缩放画布。
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            const factor = wheelZoomFactor(event.deltaY);
            const newScale = Math.min(Math.max(current.k * factor, 0.05), 5);
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const worldX = (mouseX - current.x) / current.k;
            const worldY = (mouseY - current.y) / current.k;
            commit({ x: mouseX - worldX * newScale, y: mouseY - worldY * newScale, k: newScale });
            return;
        }

        // Shift + 滚轮：无论光标停在面板哪个位置，都左右平移画布（兼容 Windows 下产生 deltaX 或 deltaY）。
        if (event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            commit({ ...current, x: current.x - horizontal });
            return;
        }

        // 单独滚轮：只有「已激活且自身有纵向滚动条」的输入框、或节点内数据滚动区才让给原生滚动。
        if (focusedScrollableEditor(target) || nodeScrollArea(target)) return;

        event.preventDefault();
        event.stopPropagation();
        commit({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY });
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        const input = target?.closest("input");

        if (target?.closest("[data-canvas-overlay],.ant-modal,.ant-modal-wrap,.ant-popover,.ant-dropdown") || (target?.closest("[data-canvas-no-zoom]") && !target.closest("[data-node-id]"))) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
        const shouldPan = event.button === 1 || (event.button === 0 && (spaceRef.current || typingSpaceRef.current || (tool === "pan" && isBackgroundClick)));
        if (!shouldPan && (target?.closest("textarea,[contenteditable]:not([contenteditable='false'])") || (input instanceof HTMLInputElement && !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(input.type)))) return;
        if ((shouldPan || (event.button === 0 && isBackgroundClick)) && document.activeElement instanceof HTMLElement) document.activeElement.blur();

        if (event.button === 0 && event.ctrlKey && event.altKey && !spaceRef.current && !typingSpaceRef.current && !target?.closest("input,textarea,select,button,a,[role='button'],[contenteditable]:not([contenteditable='false']),[data-node-toolbar],[data-node-handle]")) {
            if (onConnectionCutStart?.(event)) {
                event.preventDefault(); event.stopPropagation(); suppressClickRef.current = true; cuttingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId); return;
            }
        }

        if (shouldPan) {
            if (typingSpaceRef.current) {
                spaceRef.current = true;
                setIsSpacePressed(true);
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            }
            suppressClickRef.current = true;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewportRef.current.x,
                initialY: viewportRef.current.y,
                hasMoved: false,
                startedOnBackground: isBackgroundClick,
            };
            // Cancel a focus animation immediately; pan frames remain compositor-only.
            callbacks.current.onViewportChange(viewportRef.current);
            setIsPanning(true);
            document.body.style.cursor = "grabbing";
            return;
        }

        suppressClickRef.current = false;
        if (event.button === 0 && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
        }
    };

    const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (event.defaultPrevented || target?.closest("[data-node-id],[data-connection-id],[data-canvas-overlay],[data-canvas-no-zoom],[data-connection-create-menu],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown,input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return;
        event.preventDefault();
        onCanvasContextMenu?.(event);
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            nextViewportRef.current = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: viewportRef.current.k,
            };
            scheduleFrame();
        };

        const handlePointerUp = () => {
            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved && panState.current.startedOnBackground) {
                callbacks.current.onCanvasDeselect?.();
            }
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            frameRef.current = null; wheelCommitRef.current = false;
            const next = nextViewportRef.current || viewportRef.current;
            nextViewportRef.current = null; viewportRef.current = next; committedRef.current = next; paint(next);
            callbacks.current.onViewportChange(next);
            panState.current.isPanning = false;
            setIsPanning(false);
            document.body.style.cursor = "";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            if (document.body.style.cursor === "grabbing") document.body.style.cursor = "";
        };
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Prevent canvas scrolling from moving the page while preserving native scrolling inside overlays and dialogs.
        const preventWheelScroll = (event: WheelEvent) => handleWheel(event);
        container.addEventListener("wheel", preventWheelScroll, { passive: false, capture: true });
        return () => container.removeEventListener("wheel", preventWheelScroll, true);
    }, [containerRef]);

    const activeTool = isSpacePressed ? "pan" : tool;
    // 切断连线用的角色图标：浅色主题用黑色线稿，深色主题用白色线稿，红点（热点）两版一致。
    // Ctrl+Alt 剪切光标：绿色兔子线稿，热点取左上角红点中心（96px 图上的 21,30）。
    const cutCursor = `url("${import.meta.env?.BASE_URL ?? "/"}cut-cursor.png") 21 30, auto`;
    const cursor = cutReady ? cutCursor : isPanning ? "grabbing" : activeTool === "pan" ? "grab" : undefined;

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full select-none overflow-clip"
            data-cut-cursor={cutReady ? "" : undefined}
            style={{ background, cursor }}
            onPointerDownCapture={handlePointerDown}
            onMouseDownCapture={(event) => { if (panState.current.isPanning || cuttingRef.current) { event.preventDefault(); event.stopPropagation(); } }}
            onClickCapture={(event) => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; } }}
            onContextMenu={handleContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            {cutReady ? <style>{`[data-cut-cursor], [data-cut-cursor] * { cursor: ${cutCursor} !important; }`}</style> : null}
            <div ref={gridRef} className="pointer-events-none absolute inset-0"><CanvasGrid viewport={viewport} /></div>
            <CanvasNodeBurstLayer viewport={viewport} />
            <div ref={paintedRef} className="absolute" style={{ left: viewport.x, top: viewport.y }}>
                <div ref={worldRef} data-canvas-world style={{ zoom: viewport.k }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

/** 已激活且自身有纵向滚动条的输入框：滚轮交给它原生滚动，其余情况一律交给画布。 */
function focusedScrollableEditor(target: Element | null) {
    const box = target?.closest("textarea,input,[contenteditable='true']");
    if (!(box instanceof HTMLElement)) return false;
    const active = document.activeElement;
    if (!(active === box || (active instanceof Node && box.contains(active)))) return false;
    return box.scrollHeight > box.clientHeight + 1;
}

/** 节点内部的数据滚动区（多维表格、分析结果等）：悬停即原生滚动。 */
function nodeScrollArea(target: Element | null) {
    const box = target?.closest("[data-node-scroll]");
    if (!(box instanceof HTMLElement)) return false;
    return box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
}

function CanvasGrid({ viewport }: { viewport: ViewportTransform }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { size, opacity } = gridMetrics(viewport.k);

    return (
        <div
            className="pointer-events-none absolute inset-0"
            style={{
                // 1px 细点，间距随缩放变化：缩小看点更细，放大点间距变大（与即梦一致）。
                backgroundImage: `radial-gradient(circle, ${theme.canvas.dot} 1px, transparent 1.05px)`,
                backgroundSize: `${size}px ${size}px`,
                backgroundPosition: `${viewport.x % size}px ${viewport.y % size}px`,
                opacity,
            }}
        />
    );
}
