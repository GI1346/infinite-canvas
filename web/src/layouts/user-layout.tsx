import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import "./workspace.css";

import { CanvasAssistantDock } from "@/components/agent/canvas-assistant-dock";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { useDeepSeekHarness } from "@/hooks/use-deepseek-harness";

export default function UserLayout({ children }: { children: ReactNode }) {
    useDeepSeekHarness();
    const canvas = /^\/canvas\/[^/]+/.test(useLocation().pathname);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className={`${canvas ? "" : "app-workspace"} flex min-w-0 flex-1 flex-col overflow-hidden`} style={{ background: theme.canvas.background, color: theme.node.text }}>
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <CanvasAssistantDock />
        </div>
    );
}
