import { ConfigProvider } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, type ReactNode } from "react";
import { useGenerationRunnerStore } from "@/stores/canvas/use-generation-runner-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { defaultHomeWallpaper, homeGlassSurface, homeGlassVariables } from "@/lib/home-appearance";
import { useHomeAppearanceStore } from "@/stores/use-home-appearance-store";
import { useThemeStore } from "@/stores/use-theme-store";
import "./workspace.css";

import { CanvasAssistantDock } from "@/components/agent/canvas-assistant-dock";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { useAutoPairQuotes } from "@/hooks/use-auto-pair-quotes";
import { useDeepSeekHarness } from "@/hooks/use-deepseek-harness";

function BackgroundGenerationStatus() {
    const tasks = useGenerationRunnerStore((state) => state.tasks);
    const active = Object.values(tasks);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!active.length) return null;
    return <Link to={`/canvas/${encodeURIComponent(active[0].projectId)}`} title="点击返回正在生图的画布" className="mt-2 flex shrink-0 items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition hover:brightness-110" style={{ background: theme.accent.soft, borderColor: theme.accent.soft, color: theme.toolbar.activeText }}>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-current motion-safe:animate-pulse" />后台生图中</span><span className="font-mono font-semibold tabular-nums">{active.length}</span>
    </Link>;
}

function HomeWorkspace({ children }: { children: ReactNode }) {
    const colorTheme = useThemeStore((state) => state.theme), theme = canvasThemes[colorTheme];
    const glass = useHomeAppearanceStore((state) => state.glass);
    const wallpaperUrl = useHomeAppearanceStore((state) => state.wallpaperUrl);
    useEffect(() => { void useHomeAppearanceStore.getState().loadWallpaper(); }, []);
    const providerTheme = useMemo(() => ({ token: { colorPrimary: theme.accent.base, colorInfo: theme.accent.base, colorLink: theme.accent.base, colorPrimaryBg: theme.accent.soft } }), [theme]);

    return <div data-home-shell className="relative flex h-dvh gap-4 overflow-hidden p-4" style={{ ...homeGlassVariables(colorTheme, glass), background: theme.canvas.background, color: theme.node.text }}>
        <img data-home-wallpaper src={wallpaperUrl || defaultHomeWallpaper(colorTheme)} alt="" className="pointer-events-none absolute inset-0 size-full object-cover object-center" style={{ filter: !wallpaperUrl && colorTheme === "dark" ? "brightness(1.45) contrast(1.05)" : "none" }} />
        <AppTopNav glass footerStatus={<BackgroundGenerationStatus />} />
        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[26px] border" style={homeGlassSurface(theme)}>
            {/* Keep the glass visible around page content and use the theme's accent for controls. */}
            <ConfigProvider theme={providerTheme}><div className="min-h-0 flex-1 overflow-hidden [&>*]:!bg-transparent">{children}</div></ConfigProvider>
        </div>
    </div>;
}

export default function UserLayout({ children }: { children: ReactNode }) {
    useDeepSeekHarness();
    // 全局双引号自动配对：画布节点、生成提示词、表格单元格、Agent 对话框都走这一份监听。
    useAutoPairQuotes();
    const { pathname } = useLocation();
    const projectPage = /^\/canvas\/[^/]+/.test(pathname);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    if (!projectPage) return <HomeWorkspace>{children}</HomeWorkspace>;

    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <CanvasAssistantDock />
        </div>
    );
}
