import { useEffect, useState, type CSSProperties } from "react";
import { App, Button, Modal, Progress, Tag, Timeline } from "antd";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { useVersionCheck } from "@/hooks/use-version-check";
import { APP_VERSION } from "@/constant/env";
import { desktopUpdater } from "@/lib/desktop-updater";

const releasePage = "https://github.com/GI1346/infinite-canvas/releases/latest";

function getTagColor(type: string) {
    if (type === "新增" || type === "Added") return "green";
    if (type === "修复" || type === "Fixed") return "red";
    if (type === "调整" || type === "Changed") return "blue";
    if (type === "文档" || type === "Docs") return "purple";
    return "default";
}

function releaseTypeLabel(type: string, t: TFunction) {
    const key = ({ 新增: "added", 修复: "fixed", 调整: "changed", 优化: "optimized", 文档: "docs" } as Record<string, string>)[type];
    return key ? t(`version.types.${key}`) : type;
}

type VersionReleaseModalProps = {
    className?: string;
    style?: CSSProperties;
};

export function VersionReleaseModal({ className, style }: VersionReleaseModalProps) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const { open, setOpen, openReleaseModal, latestVersion, releases, checking, hasNewVersion, checkLatestRelease } = useVersionCheck();
    const updater = desktopUpdater();
    const [installing, setInstalling] = useState<null | "hot" | "install">(null);
    const [percent, setPercent] = useState(0);

    useEffect(() => (installing ? updater?.onProgress((progress) => setPercent(progress.percent)) : undefined), [installing, updater]);

    const runUpdate = async (mode: "hot" | "install") => {
        if (!updater) { window.open(releasePage, "_blank", "noopener"); return; }
        setInstalling(mode);
        setPercent(0);
        try {
            if (mode === "hot") await updater.hot(latestVersion);
            else await updater.install(latestVersion);
        } catch (error) {
            setInstalling(null);
            message.error(error instanceof Error ? error.message : t("version.updateFailed"));
        }
    };

    return (
        <>
            <button
                type="button"
                className={className || "shrink-0 cursor-pointer text-xs font-medium text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white"}
                style={style}
                onClick={openReleaseModal}
                title={t("version.viewUpdates")}
            >
                <span className="relative inline-flex">
                    {APP_VERSION}
                    {hasNewVersion ? <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-green-500" /> : null}
                </span>
            </button>
            <Modal title={t("version.title")} open={open} width={680} centered footer={null} onCancel={() => setOpen(false)}>
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="text-xs text-stone-500 dark:text-stone-400">{t("version.currentVersion")}</div>
                        <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{APP_VERSION}</div>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-stone-500 dark:text-stone-400">{t("version.latestVersion")}</div>
                            <button
                                type="button"
                                className="cursor-pointer bg-transparent p-0 text-[11px] font-normal text-stone-400 underline-offset-2 transition hover:text-stone-700 hover:underline dark:text-stone-500 dark:hover:text-stone-300"
                                onClick={() => void checkLatestRelease(true)}
                            >
                                {t(checking ? "version.checking" : "version.checkUpdates")}
                            </button>
                        </div>
                        <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{latestVersion}</div>
                    </div>
                </div>
                {hasNewVersion ? (
                    <div className="mb-4 rounded-lg border border-[#0ea977]/40 bg-[#0ea977]/[0.08] px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0 text-xs text-stone-600 dark:text-stone-300">
                                <span className="font-semibold text-stone-900 dark:text-stone-100">{t("version.foundNew", { version: latestVersion })}</span>
                                <span className="ml-2 opacity-80">
                                    · {installing ? (installing === "hot" ? t("version.hotDownloading", { percent }) : t("version.downloading", { percent })) : updater ? t("version.hotHint") : t("version.downloadHint")}
                                </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button type="primary" size="small" loading={installing === "hot"} disabled={installing === "install"} icon={installing ? undefined : <Download className="size-3.5" />} style={{ background: "#0ea977", borderColor: "#0ea977" }} onClick={() => void runUpdate("hot")}>
                                    {installing === "hot" ? t("version.hotDownloading", { percent }) : updater ? t("version.updateNow") : t("version.goDownload")}
                                </Button>
                                {updater ? (
                                    <button type="button" className="cursor-pointer bg-transparent p-0 text-[11px] text-stone-500 underline underline-offset-2 transition hover:text-stone-800 disabled:opacity-50 dark:text-stone-400 dark:hover:text-stone-200" disabled={installing === "hot"} onClick={() => void runUpdate("install")}>
                                        {installing === "install" ? t("version.downloading", { percent }) : t("version.installFallback")}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        {installing ? <Progress percent={percent} size="small" showInfo={false} strokeColor="#0ea977" className="!mb-0 !mt-2" /> : null}
                    </div>
                ) : null}
                <div className="max-h-[56vh] overflow-y-auto pr-2">
                    <Timeline
                        items={releases.map((release) => ({
                            content: (
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-stone-950 dark:text-stone-100">{release.version === "Unreleased" ? t("version.unreleased") : release.version}</span>
                                        <span className="text-xs text-stone-500 dark:text-stone-400">{release.date}</span>
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {release.version === latestVersion ? <Tag color="green">{t("version.latest")}</Tag> : null}
                                            {release.version === APP_VERSION ? <Tag>{t("version.current")}</Tag> : null}
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                        {release.items.map((item, index) => (
                                            <div key={`${release.version}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
                                                <Tag color={getTagColor(item.type)} className="m-0 mt-0.5 shrink-0 whitespace-nowrap">
                                                    {releaseTypeLabel(item.type, t)}
                                                </Tag>
                                                <span className="min-w-0 flex-1">{item.content}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ),
                        }))}
                    />
                </div>
            </Modal>
        </>
    );
}
