import { ChevronDown, Compass, Focus } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    onFocusSelected?: () => void;
    hasSelection?: boolean;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
};

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

export const CanvasZoomControls = memo(function CanvasZoomControls({ scale, onScaleChange, onReset, onFocusSelected, hasSelection, isMiniMapOpen, onToggleMiniMap }: CanvasZoomControlsProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const activeStyle = { background: theme.accent.soft, color: theme.accent.base };

    useEffect(() => {
        if (!menuOpen) return;
        const close = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [menuOpen]);

    return (
        <div
            ref={rootRef}
            data-canvas-overlay
            data-canvas-no-zoom
            className="absolute bottom-5 right-5 z-[60]"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {menuOpen && (
                <div
                    data-canvas-overlay
                    data-canvas-no-zoom
                    className="bf-spring-pop absolute bottom-14 right-0 w-40 rounded-2xl border p-1.5 text-xs"
                    style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                >
                    <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10"
                        onClick={() => { onReset(); setMenuOpen(false); }}
                    >
                        <span>适配全部节点</span>
                    </button>
                    {hasSelection && onFocusSelected && (
                        <button
                            type="button"
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10"
                            onClick={() => { onFocusSelected(); setMenuOpen(false); }}
                        >
                            <span>聚焦选中节点</span>
                        </button>
                    )}
                    <div className="my-1 border-t" style={{ borderColor: theme.glass.insetBorder }} />
                    {ZOOM_PRESETS.map((preset) => {
                        const pct = Math.round(preset * 100);
                        const active = Math.abs(scale - preset) < 0.02;
                        return (
                            <button
                                key={preset}
                                type="button"
                                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-mono transition hover:bg-black/5 dark:hover:bg-white/10"
                                style={active ? activeStyle : undefined}
                                onClick={() => { onScaleChange(preset); setMenuOpen(false); }}
                            >
                                <span>{pct}%</span>
                                {preset === 1 && <span className="font-sans text-[10px] opacity-65">实际像素</span>}
                            </button>
                        );
                    })}
                </div>
            )}
            <div className="bf-canvas-glass flex items-center gap-2 rounded-2xl border px-2.5 py-1.5" style={{ ...canvasGlass(theme), color: theme.toolbar.item }}>
                <div className="flex items-center gap-0.5 rounded-xl bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                    <Tooltip title={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}>
                        <Button
                            type="text"
                            className="!h-7 !w-7 !min-w-7 !rounded-lg !p-0"
                            style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }}
                            icon={<Compass className="size-4" />}
                            onClick={onToggleMiniMap}
                            aria-label={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}
                        />
                    </Tooltip>
                    <Tooltip title={t("canvas.resetView")}>
                        <Button type="text" className="!h-7 !w-7 !min-w-7 !rounded-lg !p-0" style={{ color: theme.toolbar.item }} icon={<Focus className="size-4" />} onClick={onReset} aria-label={t("canvas.resetView")} />
                    </Tooltip>
                </div>
                <Tooltip title={t("canvas.zoom")}>
                    <input
                        type="range"
                        min="5"
                        max="500"
                        step="1"
                        value={Math.round(scale * 100)}
                        className="w-20"
                        style={{ accentColor: theme.node.activeStroke }}
                        onChange={(event) => onScaleChange(Number(event.target.value) / 100)}
                        aria-label={t("canvas.zoom")}
                    />
                </Tooltip>
                <button
                    type="button"
                    aria-label="快捷缩放比例"
                    aria-expanded={menuOpen}
                    className="inline-flex h-7 items-center gap-1 rounded-lg px-2 font-mono text-xs font-semibold tabular-nums transition hover:brightness-110"
                    style={activeStyle}
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    <span>{Math.round(scale * 100)}%</span>
                    <ChevronDown className="size-3 opacity-70" />
                </button>
            </div>
        </div>
    );
});
