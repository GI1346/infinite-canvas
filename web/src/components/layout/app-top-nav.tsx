import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { canvasThemes } from "@/lib/canvas-theme";
import { homeGlassSurface } from "@/lib/home-appearance";
import { useThemeStore } from "@/stores/use-theme-store";

/** 左侧主导航；glass 模式下作为浮在底图上的圆角玻璃卡片（画布主页）。 */
export function AppTopNav({ glass = false, footerStatus }: { glass?: boolean; footerStatus?: ReactNode }) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const routeSlug = pathname.split("/").filter(Boolean)[0] || "canvas";
    const slug = routeSlug === "assets" ? "resources" : routeSlug;
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? slug as NavigationToolSlug : undefined;
    const activeIndex = navigationTools.findIndex((tool) => tool.slug === activeToolSlug);
    const shellStyle = glass ? homeGlassSurface(theme, true) : { background: theme.node.panel, borderColor: theme.node.stroke };
    return <>
        {!hideHeader && <aside aria-label="主导航" className={`${glass ? "relative z-10 h-full w-[264px] rounded-[26px] border p-3.5" : "h-full w-[76px] border-r px-3 py-7 md:w-[248px] md:px-6"} flex shrink-0 flex-col`} style={{ ...shellStyle, color: theme.node.text }}>
            <Link to="/" className="mb-7 flex min-h-12 items-center gap-3 px-1.5" title="BlinkFlow 首页">
                <img src="/blinkflow.png" alt="" className="size-10 shrink-0 rounded-2xl shadow-md" />
                <div className="hidden min-w-0 md:block"><strong className="text-lg tracking-tight">{t("meta.title")}</strong><p className="mt-1 text-[10px] tracking-[0.18em]" style={{ color: theme.node.muted }}>无限画布 · 创作空间</p></div>
            </Link>
            <nav className="thin-scrollbar min-h-0 flex-1 overflow-y-auto" aria-label="工作区"><div className="relative grid gap-1">
                <div aria-hidden="true" className="bf-nav-indicator pointer-events-none absolute inset-x-0 top-0 h-11 rounded-xl" style={{ transform: `translateY(${Math.max(activeIndex, 0) * 48}px)`, opacity: activeIndex < 0 ? 0 : 1, background: theme.accent.soft, boxShadow: `inset 0 0 0 1px ${theme.accent.soft}` }} />
                {navigationTools.map((tool) => {
                    const Icon = tool.icon, active = tool.slug === activeToolSlug, label = t(`navigation.${tool.slug}`);
                    return (
                        <Link
                            key={tool.slug}
                            to={`/${tool.slug}`}
                            aria-current={active ? "page" : undefined}
                            title={label}
                            className="relative flex h-11 items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition hover:opacity-80 md:justify-start"
                            style={{ color: active ? theme.accent.base : theme.node.label }}
                        >
                            <Icon className="size-[18px] shrink-0" />
                            <span className="hidden truncate md:inline">{label}</span>
                        </Link>
                    );
                })}
            </div></nav>
            {footerStatus}
            <div className="mt-4 border-t pt-3 [&>div]:!flex [&>div]:!flex-wrap [&>div]:!justify-center md:[&>div]:!justify-start" style={{ borderColor: theme.node.stroke }}><UserStatusActions showConfig={false} showHomeAppearance={glass} /></div>
        </aside>}
        <AppConfigModal />
    </>;
}
