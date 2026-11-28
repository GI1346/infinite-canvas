import { CanvasLogsModal } from "./canvas-logs-modal";
import { CanvasWheelSensitivity } from "./canvas-wheel-sensitivity";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Crosshair, Download, Eraser, FileText, Home, Images, Keyboard, Menu, Moon, Plus, Redo2, Search, Settings2, Square, Sun, Trash2, Undo2, Upload } from "lucide-react";
import { App, Button, Dropdown, Modal, Popover, Slider, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useConfigStore } from "@/stores/use-config-store";
import { useCanvasNavigationStore } from "@/stores/use-canvas-navigation-store";
import { useGenerationRunnerStore, type RunningGenerationTask } from "@/stores/canvas/use-generation-runner-store";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { DOCS_URL } from "@/constant/env";
import { openDeepSeekHarness } from "@/services/api/deepseek-harness";
import { recordDiagnostic } from "@/services/diagnostics";
import type { CanvasNodeData } from "@/types/canvas";

export function CanvasTopBar({
    projectId,
    nodes,
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
    onExportWorkflow,
    onImportWorkflow,
    onImportImage,
    onOpenPlugins,
    onOpenCleanup,
    onOpenNodeSearch,
    onFocusNodes,
    onUndo,
    onRedo,
}: {
    projectId?: string;
    nodes?: CanvasNodeData[];
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
    onExportWorkflow: () => void;
    onImportWorkflow: () => void;
    onImportImage: () => void;
    onOpenPlugins: () => void;
    onOpenCleanup: () => void;
    onOpenNodeSearch?: () => void;
    onFocusNodes?: (nodeIds: string[]) => void;
    onUndo: () => void;
    onRedo: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const allTasks = useGenerationRunnerStore((state) => state.tasks);
    const abortTask = useGenerationRunnerStore((state) => state.abortTask);
    const { t } = useTranslation();
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [harnessOpening, setHarnessOpening] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const { message } = App.useApp();

    const projectTasks = useMemo(
        () => (projectId ? Object.values(allTasks).filter((task) => task.projectId === projectId) : []),
        [allTasks, projectId],
    );

    useEffect(() => {
        if (!projectTasks.length) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [projectTasks.length]);

    const taskLabel = (task: RunningGenerationTask) => {
        const lookupId = task.targetNodeId || task.nodeId;
        const found = nodes?.find((item) => item.id === lookupId || item.id === task.nodeId);
        return found?.title || "后台生成任务";
    };

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
            <header className="pointer-events-none absolute inset-x-4 top-3 z-[60] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3" data-canvas-overlay data-canvas-no-zoom data-canvas-top-toolbar style={{ color: theme.node.text }}>
                {/* 左上角悬浮岛：品牌徽章 + 主菜单 + 项目名 + 状态胶囊 */}
                <div className="bf-canvas-glass pointer-events-auto flex h-11 min-w-0 items-center gap-1.5 justify-self-start rounded-2xl px-2" style={{ ...canvasGlass(theme), color: theme.node.text }}>
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0ea977] to-[#37d39b] text-[11px] font-bold leading-none text-white">BF</div>
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
                                { key: "export", icon: <Download className="size-4" />, label: "导出当前画布资源（选目录）", onClick: onExportProject },
                                { key: "export-workflow", icon: <Download className="size-4" />, label: "导出工作流 (.json)", onClick: onExportWorkflow },
                                { key: "import-workflow", icon: <Upload className="size-4" />, label: "导入工作流 (.json)", onClick: onImportWorkflow },
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
                                className="max-w-[180px] bg-transparent p-0 text-left text-sm font-semibold tracking-normal outline-none sm:max-w-[260px] md:max-w-[340px]"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="max-w-[180px] truncate border-b border-dashed border-transparent text-left text-sm font-semibold tracking-normal transition hover:border-current sm:max-w-[260px] md:max-w-[340px]"
                                onDoubleClick={onStartTitleEditing}
                                title={t("canvas.renameHint")}
                            >
                                {title}
                            </button>
                        )}
                    </div>
                    {projectTasks.length > 0 ? (
                        <Popover
                            trigger="click"
                            placement="bottomLeft"
                            content={
                                <div
                                    data-canvas-overlay
                                    data-canvas-no-zoom
                                    className="flex w-72 flex-col gap-2 p-1 text-xs"
                                    style={{ color: theme.node.text }}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onWheel={(event) => event.stopPropagation()}
                                >
                                    <div className="flex items-center justify-between px-1">
                                        <span className="font-semibold">当前画布后台任务</span>
                                        <span className="font-mono text-[11px]" style={{ color: theme.node.muted }}>{projectTasks.length} 项运行中</span>
                                    </div>
                                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                                        {projectTasks.map((task) => {
                                            const elapsed = Math.max(0, Math.floor((now - task.startedAt) / 1000));
                                            const targetIds = task.outputNodeIds?.length ? task.outputNodeIds : [task.targetNodeId || task.nodeId];
                                            return (
                                                <div key={`${task.projectId}:${task.nodeId}`} className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2" style={{ background: theme.glass.inset }}>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate font-medium">{taskLabel(task)}</div>
                                                        <div className="font-mono text-[10px]" style={{ color: theme.accent.base }}>已运行 {elapsed}s</div>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        {onFocusNodes && (
                                                            <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition hover:opacity-80" style={{ background: theme.accent.soft, color: theme.accent.base }} onClick={() => onFocusNodes(targetIds)}>
                                                                <Crosshair className="size-3" />定位
                                                            </button>
                                                        )}
                                                        <button type="button" aria-label={`停止 ${taskLabel(task)}`} className="inline-flex items-center gap-1 rounded-lg bg-red-500/12 px-2 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-500/20" onClick={() => abortTask(task)}>
                                                            <Square className="size-2.5" />停止
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            }
                        >
                            <button
                                type="button"
                                aria-label={`后台生成任务（${projectTasks.length} 项运行中）`}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition hover:brightness-110"
                                style={{ background: theme.accent.soft, color: theme.accent.base }}
                            >
                                <span className="size-1.5 animate-pulse rounded-full bg-current" />
                                生成中 {projectTasks.length}
                            </button>
                        </Popover>
                    ) : (
                        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[#0ea977]/12 px-2 py-0.5 text-[11px] font-medium text-[#0ea977] dark:bg-[#37d39b]/15 dark:text-[#37d39b] xl:inline-flex">
                            <span className="size-1.5 rounded-full bg-current" />
                            已同步
                        </span>
                    )}
                </div>

                {/* 正中间悬浮岛：撤销 / 重做 + 主页 + 模型与接口 + 快速定位 */}
                <div className="bf-canvas-glass pointer-events-auto hidden h-11 items-center gap-1 justify-self-center rounded-2xl px-2 sm:flex" style={{ ...canvasGlass(theme), color: theme.node.text }}>
                    <div className="flex items-center gap-0.5 rounded-xl bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                        <Tooltip title={t("canvas.undo")}><Button type="text" aria-label={t("canvas.undo")} disabled={!canUndo} icon={<Undo2 className="size-4" />} onClick={onUndo} /></Tooltip>
                        <Tooltip title={t("canvas.redo")}><Button type="text" aria-label={t("canvas.redo")} disabled={!canRedo} icon={<Redo2 className="size-4" />} onClick={onRedo} /></Tooltip>
                    </div>
                    <div className="mx-1 h-4 w-px shrink-0 bg-black/10 dark:bg-white/15" />
                    <BarAction icon={<Home className="size-4" />} label={t("canvas.home")} onClick={onHome} />
                    <div className="rounded-xl bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                        <BarAction icon={<Settings2 className="size-4" />} label={t("navigation.config")} onClick={() => openConfigDialog(false)} />
                    </div>
                    {onOpenNodeSearch && (
                        <>
                            <div className="mx-1 h-4 w-px shrink-0 bg-black/10 dark:bg-white/15" />
                            <button
                                type="button"
                                aria-label="快速定位节点"
                                title="快速定位画布节点 (Ctrl+K)"
                                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-black/[0.04] px-2.5 text-xs font-medium transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
                                style={{ color: theme.node.muted }}
                                onClick={onOpenNodeSearch}
                            >
                                <Search className="size-3.5" />
                                <span className="hidden lg:inline">定位</span>
                                <kbd className="hidden rounded border px-1 py-0.5 font-mono text-[10px] leading-none lg:inline" style={{ borderColor: theme.node.stroke }}>Ctrl K</kbd>
                            </button>
                        </>
                    )}
                </div>

                {/* 右上角悬浮岛：实心翡翠绿 Harness（唯一 AI 协同入口）+ 主题 + 更多收纳 */}
                <div className="bf-canvas-glass pointer-events-auto flex h-11 items-center gap-1.5 justify-self-end rounded-2xl px-2" style={{ ...canvasGlass(theme), color: theme.node.text }}>
                    <BarAction variant="solid" icon={<img src="/icons/deepseek.svg" alt="" className="size-4" />} label="Harness" disabled={harnessOpening} onClick={async () => {
                        if (harnessOpening) return;
                        setHarnessOpening(true);
                        try { await openDeepSeekHarness(); }
                        catch (error) { recordDiagnostic("DeepSeek Harness 启动", error); message.error(error instanceof Error ? error.message : "DeepSeek Harness 启动失败"); }
                        finally { setHarnessOpening(false); }
                    }} />
                    <AnimatedThemeToggler theme={colorTheme} onThemeChange={setTheme} className={barActionClass} style={{ color: theme.node.text }} aria-label="主题" title="切换主题">
                        {colorTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                        <span className="text-[13px]">主题</span>
                    </AnimatedThemeToggler>
                    <div className="mx-0.5 h-4 w-px shrink-0 bg-black/10 dark:bg-white/15" />
                    <Popover
                        trigger="click"
                        placement="bottomRight"
                        content={
                            <div className="flex w-64 flex-col gap-2 p-1">
                                <div className="px-1 text-[11px] font-semibold" style={{ color: theme.node.muted }}>系统工具与画布偏好</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button type="button" className={moreItemClass} style={{ color: theme.node.text }} onClick={() => setLogsOpen(true)}><FileText className="size-3.5" />日志</button>
                                    <button type="button" className={moreItemClass} style={{ color: theme.node.text }} onClick={onOpenCleanup}><Eraser className="size-3.5" />清理</button>
                                    <button type="button" className={moreItemClass} style={{ color: theme.node.text }} onClick={() => setShortcutsOpen(true)}><Keyboard className="size-3.5" />快捷键</button>
                                    <VersionReleaseModal className={moreItemClass} style={{ color: theme.node.text }} />
                                </div>
                                <div className="border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                                    <WheelSpeedPanel />
                                </div>
                            </div>
                        }
                    >
                        <button type="button" className={moreTriggerClass} style={{ color: theme.node.text }} title="日志、清理、快捷键、滚轮速度与版本">
                            <Settings2 className="size-3.5" />
                            <span>更多</span>
                        </button>
                    </Popover>
                </div>
            </header>
            <CanvasLogsModal open={logsOpen} onClose={() => setLogsOpen(false)} />
            <Modal title={t("canvas.shortcuts")} open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["Space", t("canvas.shortcut.drag")]} value="平移画布（悬停节点也可用）" />
                    <Shortcut keys={[t("canvas.shortcut.rightClick")]} value={t("canvas.shortcut.createNode")} />
                    <Shortcut keys={[t("canvas.shortcut.wheel")]} value={t("canvas.shortcut.zoom")} />
                    <Shortcut keys={[t("canvas.shortcut.zoomSlider")]} value={t("canvas.shortcut.preciseZoom")} />
                    <Shortcut keys={[t("canvas.shortcut.drag")]} value={t("canvas.shortcut.boxSelect")} />
                    <Shortcut keys={["Shift / Cmd", t("canvas.shortcut.click")]} value={t("canvas.shortcut.addSelection")} />
                    <Shortcut keys={["Ctrl / Cmd", "K"]} value="快速定位节点" />
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
/** 实心翡翠绿 / 柔和翠绿胶囊共用的外框（颜色走内联 style，避开 antd reset 对分层 utility 的覆盖）。 */
const barChipClass = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium transition hover:brightness-[1.06] disabled:opacity-40";
/** 「更多」弹出面板里的网格按钮。 */
const moreItemClass = "flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10";
/** 右上角「更多」触发器：浅底胶囊，和实心绿 Harness 拉开层级。 */
const moreTriggerClass = "flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-black/[0.045] px-2.5 text-xs font-medium transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.12]";

/** 顶栏按钮统一「图标 + 文字」。 */
function BarAction({ icon, label, onClick, active, disabled, variant = "plain" }: { icon: React.ReactNode; label: string; onClick?: () => void | Promise<void>; active?: boolean; disabled?: boolean; variant?: "plain" | "solid" | "soft" }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dark = colorTheme === "dark";
    const style =
        variant === "solid"
            ? { background: dark ? "#37d39b" : "#0ea977", color: dark ? "#0a0c0f" : "#ffffff" }
            : variant === "soft"
              ? { background: dark ? "rgba(55,211,155,.15)" : "rgba(14,169,119,.12)", color: dark ? "#37d39b" : "#0ea977" }
              : { color: theme.node.text, background: active ? theme.accent.soft : undefined };
    return (
        <button type="button" aria-label={label} title={label} disabled={disabled} onClick={() => void onClick?.()} className={variant === "plain" ? barActionClass : barChipClass} style={style}>
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
