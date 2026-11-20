import { App } from "antd";
import { ImagePlus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Popover } from "radix-ui";
import { useRef } from "react";

import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { defaultHomeWallpaper } from "@/lib/home-appearance";
import { defaultHomeGlass, homeGlassLimits, homeGlassPresets, homeWallpaperAccept, useHomeAppearanceStore } from "@/stores/use-home-appearance-store";
import { useThemeStore } from "@/stores/use-theme-store";

const entryLabel = "主页壁纸与磨砂调参";
const controls = [ { key: "blur", label: "模糊半径", unit: "px" }, { key: "alpha", label: "玻璃浓度", unit: "%" } ] as const;
const action = "inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50";

export function HomeAppearanceControls() {
    const colorTheme = useThemeStore((state) => state.theme), theme = canvasThemes[colorTheme];
    const { glass, wallpaperUrl, wallpaperReady, wallpaperBusy, setGlass, setWallpaper } = useHomeAppearanceStore();
    const input = useRef<HTMLInputElement>(null);
    const { message } = App.useApp();
    const disabled = !wallpaperReady || wallpaperBusy;
    const changeWallpaper = async (file: File | null) => {
        try { await setWallpaper(file); }
        catch (error) { message.error(error instanceof Error ? error.message : "壁纸保存失败，请重试"); }
    };
    return <div className="space-y-3" data-home-appearance-controls>
        <section aria-label="自定义壁纸" className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: theme.glass.border }}>
                    <img src={wallpaperUrl || defaultHomeWallpaper(colorTheme)} alt={wallpaperUrl ? "自定义壁纸预览" : "默认小兔子壁纸预览"} className="size-full object-cover object-center" />
                </div>
                <div className="flex flex-col items-start">
                    <button type="button" className={action} style={{ color: theme.node.text }} disabled={disabled} onClick={() => input.current?.click()}><ImagePlus className="size-4 shrink-0" />上传自定义壁纸</button>
                    <button type="button" className={action} style={{ color: theme.node.muted }} disabled={disabled || !wallpaperUrl} onClick={() => void changeWallpaper(null)}><RotateCcw className="size-3.5 shrink-0" />恢复默认小兔子</button>
                </div>
                <input ref={input} type="file" accept={homeWallpaperAccept} aria-label="选择自定义壁纸" className="hidden" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void changeWallpaper(file); }} />
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: theme.node.muted }}>推荐 16:9 横屏宽图（≥ 1920×1080 / 2K），支持 JPG / PNG / WebP，自动居中铺满不变形</p>
        </section>
        <section aria-label="玻璃材质" className="space-y-2.5 border-t pt-2.5" style={{ borderColor: theme.glass.border }}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">玻璃材质</span>
                <button type="button" className={action} style={{ color: theme.node.muted }} onClick={() => setGlass(defaultHomeGlass)}><RotateCcw className="size-3.5" />重置玻璃</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="玻璃材质预设">
                {homeGlassPresets.map(({ label, blur, alpha }) => {
                    const active = glass.blur === blur && glass.alpha === alpha;
                    return <button type="button" key={label} aria-pressed={active} className="rounded-lg border px-1 py-1.5 text-[11px] transition hover:brightness-110" style={{ background: active ? theme.accent.soft : theme.glass.inset, borderColor: active ? theme.accent.base : theme.glass.insetBorder, color: theme.node.text }} onClick={() => setGlass({ blur, alpha })}>
                        <span className="block font-medium">{label}</span><span className="block whitespace-nowrap font-mono text-[10px] tabular-nums" style={{ color: theme.node.muted }}>{blur}px / {alpha}%</span>
                    </button>;
                })}
            </div>
            {controls.map(({ key, label, unit }) => <label key={key} className="block text-[11px]">
                <span className="flex items-center justify-between gap-2"><span>{label}</span><output className="min-w-11 text-right font-mono tabular-nums" style={{ color: theme.node.muted }}>{glass[key]}{unit}</output></span>
                <input type="range" aria-label={label} aria-valuetext={`${glass[key]}${unit}`} {...homeGlassLimits[key]} value={glass[key]} className="mt-1 block h-4 w-full cursor-pointer" style={{ accentColor: theme.accent.base }} onChange={(event) => setGlass({ [key]: event.currentTarget.valueAsNumber })} />
            </label>)}
        </section>
    </div>;
}

export function HomeAppearancePopover({ className }: { className?: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <Popover.Root>
        <Popover.Trigger asChild><button type="button" className={className} title={entryLabel} aria-label={entryLabel}><SlidersHorizontal className="size-4" /></button></Popover.Trigger>
        <Popover.Portal><Popover.Content aria-label={entryLabel} side="top" align="start" sideOffset={8} collisionPadding={12} className="bf-spring-pop z-[1200] max-h-[var(--radix-popover-content-available-height)] w-[302px] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-2xl border p-3.5 shadow-xl outline-none" style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal aria-hidden="true" className="size-4" style={{ color: theme.accent.base }} />主页壁纸与磨砂</h2>
            <HomeAppearanceControls />
        </Popover.Content></Popover.Portal>
    </Popover.Root>;
}
