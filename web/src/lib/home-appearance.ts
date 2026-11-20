import type { CSSProperties } from "react";
import { canvasGlass, type CanvasColorTheme, type CanvasTheme } from "@/lib/canvas-theme";
import type { HomeGlassSettings } from "@/stores/use-home-appearance-store";

export function defaultHomeWallpaper(theme: CanvasColorTheme) {
    return `${import.meta.env.BASE_URL}home/home-${theme}.jpg`;
}

export function homeGlassVariables(theme: CanvasColorTheme, { blur, alpha }: HomeGlassSettings): CSSProperties {
    const rgb = theme === "dark" ? "16, 18, 23" : "255, 255, 255";
    return {
        "--home-glass-blur": `${blur}px`,
        "--home-glass-bg": `rgba(${rgb}, ${alpha / 100})`,
        "--home-card-bg": `rgba(${rgb}, ${(alpha + 6) / 100})`,
    } as CSSProperties;
}

export function homeGlassSurface(theme: CanvasTheme, sidebar = false) {
    const filter = "blur(var(--home-glass-blur, 14px)) saturate(125%)";
    return { ...canvasGlass(theme), backgroundColor: sidebar ? "var(--home-card-bg)" : "var(--home-glass-bg)", backgroundImage: "none", backdropFilter: filter, WebkitBackdropFilter: filter };
}
