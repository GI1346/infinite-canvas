import { ConfigProvider } from "antd";
import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useGenerationRunnerStore } from "@/stores/canvas/use-generation-runner-store";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
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

export default function UserLayout({ children }: { children: ReactNode }) {
    useDeepSeekHarness();
    // 全局双引号自动配对：画布节点、生成提示词、表格单元格、Agent 对话框都走这一份监听。
    useAutoPairQuotes();
    const { pathname } = useLocation();
    const projectPage = /^\/canvas\/[^/]+/.test(pathname);
    // 除画布内页外，所有页面都套同一层底图 + 两张磨砂玻璃卡（左侧导航 + 右侧内容）。
    const homePage = !projectPage;
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    if (homePage) {
        return (
            <div className="relative flex h-dvh gap-4 overflow-hidden p-4" style={{ background: theme.canvas.background, color: theme.node.text }}>
                <img src={colorTheme === "dark" ? "/home/home-dark.jpg" : "/home/home-light.jpg"} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" style={{ filter: colorTheme === "dark" ? "brightness(1.45) contrast(1.05)" : "none" }} />
                <AppTopNav glass footerStatus={<BackgroundGenerationStatus />} />
                <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[26px] border" style={canvasGlass(theme)}>
                    {/* 页面自己的 bg-background 会让玻璃失效，这里统一透出玻璃底；内部 antd 控件统一走绿色强调。 */}
                    <ConfigProvider theme={{ token: { colorPrimary: theme.accent.base, colorInfo: theme.accent.base, colorLink: theme.accent.base, colorPrimaryBg: theme.accent.soft } }}>
                        <div className="min-h-0 flex-1 overflow-hidden [&>*]:!bg-transparent">{children}</div>
                    </ConfigProvider>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className={`${projectPage ? "" : "app-workspace"} flex min-w-0 flex-1 flex-col overflow-hidden`} style={{ background: theme.canvas.background, color: theme.node.text }}>
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <CanvasAssistantDock />
        </div>
    );
}
