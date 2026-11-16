import { ConfigProvider } from "antd";
import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import "./workspace.css";

import { CanvasAssistantDock } from "@/components/agent/canvas-assistant-dock";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { useDeepSeekHarness } from "@/hooks/use-deepseek-harness";

export default function UserLayout({ children }: { children: ReactNode }) {
    useDeepSeekHarness();
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
                <AppTopNav glass />
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
