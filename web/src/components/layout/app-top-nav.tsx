import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0] || "canvas";
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? slug as NavigationToolSlug : undefined;
    return <>
        {!hideHeader && <aside aria-label="主导航" className="flex h-full w-[76px] shrink-0 flex-col border-r px-3 py-7 md:w-[248px] md:px-6" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <Link to="/" className="mb-9 flex min-h-12 items-center gap-3 px-1" title="BlinkFlow 首页">
                <img src="/blinkflow.png" alt="" className="size-11 shrink-0 rounded-2xl shadow-md" />
                <div className="hidden min-w-0 md:block"><strong className="text-xl tracking-tight">{t("meta.title")}</strong><p className="mt-1 text-[11px] tracking-widest" style={{ color: theme.node.muted }}>无限画布 · 创作空间</p></div>
            </Link>
            <nav className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto" aria-label="工作区">
                {navigationTools.map((tool) => {
                    const Icon = tool.icon, active = tool.slug === activeToolSlug, label = t(`navigation.${tool.slug}`);
                    return <Link key={tool.slug} to={`/${tool.slug}`} aria-current={active ? "page" : undefined} title={label} className="flex min-h-14 items-center justify-center gap-3 rounded-2xl px-3 py-3 text-sm transition hover:opacity-80 md:justify-start md:px-5" style={{ background: active ? theme.node.text : theme.node.fill, color: active ? theme.node.panel : theme.node.label, boxShadow: active ? theme.toolbar.shadow : undefined }}><Icon className="size-5 shrink-0" /><span className="hidden truncate md:inline">{label}</span></Link>;
                })}
            </nav>
            <div className="mt-5 border-t pt-4 [&>div]:!flex [&>div]:!flex-wrap [&>div]:!justify-center md:[&>div]:!justify-start" style={{ borderColor: theme.node.stroke }}><UserStatusActions /></div>
        </aside>}
        <AppConfigModal />
    </>;
}
