import { CanvasLogsModal } from "./canvas-logs-modal";
import { CanvasWheelSensitivity } from "./canvas-wheel-sensitivity";
import { useEffect, useRef, useState } from "react";
import { Bot, BookOpen, Download, Eraser, FileText, Gauge, Home, Images, Keyboard, Menu, Moon, Plus, Redo2, Settings2, Sun, Trash2, Undo2, Upload } from "lucide-react";
import { App, Button, Dropdown, Modal, Popover, Slider, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useConfigStore } from "@/stores/use-config-store";
import { useCanvasNavigationStore } from "@/stores/use-canvas-navigation-store";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { DOCS_URL } from "@/constant/env";
import { useHarnessSidebarStore } from "@/stores/use-harness-sidebar-store";
import { openDeepSeekHarness } from "@/services/api/deepseek-harness";
import { recordDiagnostic } from "@/services/diagnostics";
import { useCanvasAssistantStore } from "@/stores/use-canvas-assistant-store";

export function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onExportProject,
    onImportImage,
    onOpenPlugins,
    onOpenCleanup,
    onUndo,
    onRedo,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onExportProject: () => void;
    onImportImage: () => void;
    onOpenPlugins: () => void;
    onOpenCleanup: () => void;
    onUndo: () => void;
    onRedo: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const { t } = useTranslation();
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [harnessOpening, setHarnessOpening] = useState(false);
    const { message } = App.useApp();
    const agentOpen = useCanvasAssistantStore((state) => state.open);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <>
            <div className="pointer-events-auto absolute left-1/2 top-2 z-50 flex h-12 w-max max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-full border px-3" data-canvas-overlay data-canvas-no-zoom data-canvas-top-toolbar style={{ ...canvasGlass(theme), color: theme.node.text }}>
                <div className="pointer-events-auto flex min-w-[120px] shrink-0 items-center gap-1">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "home", icon: <Home className="size-4" />, label: t("canvas.home"), onClick: onHome },
                                { key: "docs", icon: <BookOpen className="size-4" />, label: t("canvas.docs"), onClick: () => window.open(DOCS_URL, "_blank", "noopener,noreferrer") },
                                { key: "projects", icon: <Images className="size-4" />, label: t("canvas.projects"), onClick: onProjects },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: t("canvas.create"), onClick: onCreateProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("canvas.deleteCurrent"), onClick: onDeleteProject },
                                { type: "divider" },
                                { key: "import", icon: <Upload className="size-4" />, label: t("canvas.importAsset"), onClick: onImportImage },
                                { key: "export", icon: <Download className="size-4" />, label: t("canvas.exportCurrent"), onClick: onExportProject },
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text={t("canvas.undo")} shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text={t("canvas.redo")} shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                            ],
                        }}
                    >
                        <button type="button" className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label={t("canvas.openMenu")}>
                            <Menu className="size-4" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-2">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="max-w-[150px] bg-transparent p-0 text-left text-sm font-medium tracking-normal outline-none"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="max-w-[150px] truncate border-b border-dashed border-transparent text-left text-sm font-medium tracking-normal transition hover:border-current"
                                onDoubleClick={onStartTitleEditing}
                                title={t("canvas.renameHint")}
                            >
                                {title}
                            </button>
                        )}
                    </div>
                </div>

                <div className="thin-scrollbar pointer-events-auto flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap [&>*]:shrink-0">
                    <Tooltip title={t("canvas.undo")}><Button type="text" aria-label={t("canvas.undo")} disabled={!canUndo} icon={<Undo2 className="size-4" />} onClick={onUndo} /></Tooltip>
                    <Tooltip title={t("canvas.redo")}><Button type="text" aria-label={t("canvas.redo")} disabled={!canRedo} icon={<Redo2 className="size-4" />} onClick={onRedo} /></Tooltip>
                    <BarAction icon={<Home className="size-4" />} label={t("canvas.home")} onClick={onHome} />
                    <BarAction icon={<Bot className="size-4" />} label="Agent" active={agentOpen} onClick={() => { const wasAgent = useHarnessSidebarStore.getState().tab === "agent"; useHarnessSidebarStore.setState({ tab: "agent" }); useCanvasAssistantStore.getState().setOpen(!agentOpen || !wasAgent); }} />
                    <BarAction icon={<img src="/icons/deepseek.svg" alt="" className="size-4" />} label="Harness" disabled={harnessOpening} onClick={async () => {
                        if (harnessOpening) return;
                        setHarnessOpening(true);
                        try { await openDeepSeekHarness(); }
                        catch (error) { recordDiagnostic("DeepSeek Harness 启动", error); message.error(error instanceof Error ? error.message : "DeepSeek Harness 启动失败"); }
                        finally { setHarnessOpening(false); }
                    }} />
                    <BarAction icon={<FileText className="size-4" />} label="日志" onClick={() => setLogsOpen(true)} />
                    <BarAction icon={<Eraser className="size-4" />} label="清理" onClick={onOpenCleanup} />
                    <BarAction icon={<Settings2 className="size-4" />} label={t("navigation.config")} onClick={() => openConfigDialog(false)} />
                    <AnimatedThemeToggler theme={colorTheme} onThemeChange={setTheme} className={barActionClass} style={{ color: theme.node.text }} aria-label="主题" title="切换主题">
                        {colorTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                        <span className="text-[13px]">主题</span>
                    </AnimatedThemeToggler>
                    <Popover trigger="click" placement="bottom" content={<WheelSpeedPanel />}>
                        <button type="button" aria-label="滚轮缩放速度" title="滚轮缩放速度" className={barActionClass} style={{ color: theme.node.text }}>
                            <Gauge className="size-4" />
                            <span className="text-[13px]">速度</span>
                        </button>
                    </Popover>
                    <VersionReleaseModal style={{ color: theme.node.text }} />
                    <BarAction icon={<Keyboard className="size-4" />} label={t("canvas.shortcuts")} onClick={() => setShortcutsOpen(true)} />
                </div>
            </div>
            <CanvasLogsModal open={logsOpen} onClose={() => setLogsOpen(false)} />
            <Modal title={t("canvas.shortcuts")} open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["Space", t("canvas.shortcut.drag")]} value="平移画布（悬停节点也可用）" />
                    <Shortcut keys={[t("canvas.shortcut.rightClick")]} value={t("canvas.shortcut.createNode")} />
                    <Shortcut keys={[t("canvas.shortcut.wheel")]} value={t("canvas.shortcut.zoom")} />
                    <Shortcut keys={[t("canvas.shortcut.zoomSlider")]} value={t("canvas.shortcut.preciseZoom")} />
                    <Shortcut keys={[t("canvas.shortcut.drag")]} value={t("canvas.shortcut.boxSelect")} />
                    <Shortcut keys={["Shift / Cmd", t("canvas.shortcut.click")]} value={t("canvas.shortcut.addSelection")} />
                    <Shortcut keys={["Ctrl / Cmd", "A"]} value={t("canvas.shortcut.selectAll")} />
                    <Shortcut keys={["Ctrl / Cmd", "C / V"]} value={t("canvas.shortcut.copyPaste")} />
                    <Shortcut keys={["Ctrl / Cmd", "G"]} value={t("canvas.shortcut.group")} />
                    <Shortcut keys={["Ctrl / Cmd", "Shift", "G"]} value={t("canvas.shortcut.ungroup")} />
                    <Shortcut keys={["Ctrl / Cmd", "Z"]} value={t("canvas.undo")} />
                    <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value={t("canvas.redo")} />
                    <Shortcut keys={["Ctrl / Cmd", "Y"]} value={t("canvas.redo")} />
                    <Shortcut keys={["Delete / Backspace"]} value={t("canvas.shortcut.delete")} />
                    <Shortcut keys={["Esc"]} value={t("canvas.shortcut.escape")} />
                    <Shortcut keys={[t("canvas.shortcut.dropMedia")]} value={t("canvas.shortcut.upload")} />
                    <CanvasWheelSensitivity />
                </div>
            </Modal>
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-6 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
                            style={{ borderColor: "rgba(120,113,108,.28)", background: "var(--card)", color: "var(--foreground)" }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}

const barActionClass = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] transition hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40";

/** 顶栏按钮统一「图标 + 文字」。 */
function BarAction({ icon, label, onClick, active, disabled }: { icon: React.ReactNode; label: string; onClick?: () => void | Promise<void>; active?: boolean; disabled?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button type="button" aria-label={label} title={label} disabled={disabled} onClick={() => void onClick?.()} className={barActionClass} style={{ color: theme.node.text, background: active ? theme.accent.soft : undefined }}>
            {icon}
            <span className="text-[13px]">{label}</span>
        </button>
    );
}

/** 顶栏「速度」面板：滚轮缩放灵敏度，不用再翻快捷键弹窗。 */
function WheelSpeedPanel() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const sensitivity = useCanvasNavigationStore((state) => state.sensitivity);
    const setSensitivity = useCanvasNavigationStore((state) => state.setSensitivity);
    return (
        <div className="w-60">
            <div className="mb-1 flex items-center justify-between text-xs" style={{ color: theme.node.muted }}>
                <span>滚轮缩放速度</span>
                <span style={{ color: theme.node.text }}>{sensitivity}</span>
            </div>
            <Slider min={1} max={100} value={sensitivity} onChange={(value) => setSensitivity(Number(value))} tooltip={{ open: false }} />
            <p className="m-0 text-[11px]" style={{ color: theme.node.muted }}>默认 50，和即梦一致；越大滚一格缩放越多。</p>
        </div>
    );
}
