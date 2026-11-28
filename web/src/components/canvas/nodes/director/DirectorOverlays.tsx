import { useState } from "react";
import {
    Check,
    Clock,
    Compass,
    Download,
    Film,
    History,
    Keyboard,
    LoaderCircle,
    Maximize2,
    Move,
    RotateCw,
    Send,
    Trash2,
    X,
} from "lucide-react";
import { canvasGlass, type CanvasTheme } from "@/lib/canvas-theme";
import type { DirectorRevision, DirectorSnapshot, DirectorStageState } from "@/types/canvas";

/** 每次进入导演台自动展示的「导演视角操作」键位引导弹窗（兔子画布专属磨砂玻璃风格） */
export function DirectorViewGuideModal({ theme, onClose }: { theme: CanvasTheme; onClose: () => void }) {
    const softBorder = theme.glass.insetBorder;
    const keyCap = (label: string, wide = false) => (
        <span
            className={`inline-flex h-10 items-center justify-center rounded-xl border font-mono text-sm font-semibold shadow-sm select-none ${wide ? "px-4 text-xs" : "w-10"}`}
            style={{
                borderColor: theme.node.stroke,
                background: theme.node.panel,
                color: theme.node.text,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.18)",
            }}
        >
            {label}
        </span>
    );

    return (
        <div
            className="fixed inset-0 z-[175] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
            onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="bf-spring-pop w-full max-w-[540px] space-y-5 rounded-3xl border p-6 text-xs shadow-2xl"
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-base font-bold tracking-tight">
                            <span
                                className="flex size-7 items-center justify-center rounded-xl text-white"
                                style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                            >
                                <Compass className="size-4" />
                            </span>
                            <span>导演视角操作</span>
                        </div>
                        <p className="text-xs" style={{ color: theme.node.muted }}>
                            使用键盘在场景中移动和旋转视角
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="关闭视角操作说明"
                        className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: theme.node.muted }}
                        onClick={onClose}
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* 左右双卡片：移动视角 + 旋转视角 */}
                <div className="grid grid-cols-2 gap-3">
                    {/* 移动视角 */}
                    <div
                        className="flex flex-col justify-between rounded-2xl border p-4"
                        style={{ borderColor: softBorder, background: theme.glass.inset }}
                    >
                        <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                                <Move className="size-3.5" style={{ color: theme.accent.base }} />
                                <span>移动视角</span>
                            </div>
                            <div className="text-[11px]" style={{ color: theme.node.muted }}>
                                按住按键即可持续移动
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col items-center gap-1.5">
                            <div className="grid grid-cols-3 gap-2 text-center text-[10px]" style={{ color: theme.node.muted }}>
                                <span className="w-10">下降</span>
                                <span className="w-10">前进</span>
                                <span className="w-10">上升</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {keyCap("Q")}
                                {keyCap("W")}
                                {keyCap("E")}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {keyCap("A")}
                                {keyCap("S")}
                                {keyCap("D")}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center text-[10px]" style={{ color: theme.node.muted }}>
                                <span className="w-10">向左</span>
                                <span className="w-10">后退</span>
                                <span className="w-10">向右</span>
                            </div>
                        </div>
                    </div>

                    {/* 旋转视角 */}
                    <div
                        className="flex flex-col justify-between rounded-2xl border p-4"
                        style={{ borderColor: softBorder, background: theme.glass.inset }}
                    >
                        <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                                <RotateCw className="size-3.5" style={{ color: theme.accent.base }} />
                                <span>旋转视角</span>
                            </div>
                            <div className="text-[11px]" style={{ color: theme.node.muted }}>
                                按住按键即可持续旋转
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col items-center gap-1.5">
                            <div className="text-center text-[10px]" style={{ color: theme.node.muted }}>
                                上转
                            </div>
                            <div className="flex justify-center">{keyCap("I")}</div>
                            <div className="grid grid-cols-3 gap-2">
                                {keyCap("J")}
                                {keyCap("K")}
                                {keyCap("L")}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center text-[10px]" style={{ color: theme.node.muted }}>
                                <span className="w-10">左转</span>
                                <span className="w-10">下转</span>
                                <span className="w-10">右转</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 底部 Shift 加速说明 + 知道了按钮 */}
                <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-3">
                        {keyCap("Shift", true)}
                        <div className="space-y-0.5">
                            <div className="text-xs font-semibold">加速移动</div>
                            <div className="text-[11px]" style={{ color: theme.node.muted }}>
                                移动或旋转时按住 Shift
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-xl px-5 text-xs font-semibold text-white shadow-md transition hover:brightness-110"
                        style={{
                            background: "linear-gradient(135deg,#0ea977,#12896a)",
                            boxShadow: "0 4px 14px rgba(14,169,119,0.28)",
                        }}
                        onClick={onClose}
                    >
                        知道了
                    </button>
                </div>
            </div>
        </div>
    );
}

/** 快捷键与鼠标操作弹窗 */
export function DirectorShortcutsModal({ theme, onClose }: { theme: CanvasTheme; onClose: () => void }) {
    const softBorder = theme.glass.insetBorder;
    const rows = [
        ["对象编辑", [
            ["0 / 1 / 2 / 3", "切换 选择 / 移动 / 旋转 / 缩放 工具"],
            ["↑ ↓ ← →", "在 X / Z 平面微移选中对象"],
            ["G", "将选中角色或物体落到地面"],
            ["Esc", "取消当前放置/路径模式或退出导演台"],
        ]],
        ["视角控制", [
            ["Q W E A S D", "自由移动导演视角（按住 Shift 加速）"],
            ["I J K L", "键盘旋转导演视角"],
            ["左键拖拽", "轨道旋转视角"],
            ["右键拖拽", "平移视角"],
            ["滚轮", "缩放视距"],
            ["Alt + 滚轮 / - =", "调整视野（FOV）"],
        ]],
    ] as const;

    return (
        <div
            className="fixed inset-0 z-[170] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
            onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="w-full max-w-lg space-y-4 rounded-2xl border p-5 text-xs shadow-2xl"
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <Keyboard className="size-4" style={{ color: theme.accent.base }} />
                        快捷键与鼠标操作
                    </div>
                    <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={onClose}>
                        <X className="size-4" />
                    </button>
                </div>
                <div className="space-y-3">
                    {rows.map(([title, list]) => (
                        <div key={title} className="space-y-1.5">
                            <div className="text-[11px] font-semibold" style={{ color: theme.accent.base }}>{title}</div>
                            <div className="space-y-1 rounded-xl p-2.5" style={{ background: theme.glass.inset }}>
                                {list.map(([k, desc]) => (
                                    <div key={k} className="flex items-center justify-between py-1">
                                        <span style={{ color: theme.node.muted }}>{desc}</span>
                                        <kbd
                                            className="rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold"
                                            style={{ borderColor: softBorder, background: theme.node.panel }}
                                        >
                                            {k}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** 修订记录抽屉（支持只读预览与一键恢复版本） */
export function DirectorRevisionsDrawer({
    theme,
    revisions,
    previewRevisionId,
    onPreview,
    onRestore,
    onClose,
}: {
    theme: CanvasTheme;
    revisions: DirectorRevision[];
    previewRevisionId: string | null;
    onPreview: (rev: DirectorRevision | null) => void;
    onRestore: (rev: DirectorRevision) => void;
    onClose: () => void;
}) {
    const softBorder = theme.glass.insetBorder;
    return (
        <div
            className="fixed inset-y-14 left-4 z-[165] flex w-80 flex-col overflow-hidden rounded-2xl border text-xs shadow-2xl"
            style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
        >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: softBorder }}>
                <div className="flex items-center gap-2 font-semibold">
                    <History className="size-4" style={{ color: theme.accent.base }} />
                    修订记录 ({revisions.length})
                </div>
                <button
                    type="button"
                    className="grid size-7 place-items-center rounded-lg hover:bg-white/10"
                    onClick={() => {
                        onPreview(null);
                        onClose();
                    }}
                >
                    <X className="size-4" />
                </button>
            </div>
            <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {revisions.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-5 text-center text-[11px]" style={{ borderColor: softBorder, color: theme.node.muted }}>
                        暂无保存记录。点击顶部「保存」后会在此自动留存修订版本。
                    </div>
                ) : (
                    revisions.map((rev) => {
                        const active = previewRevisionId === rev.id;
                        return (
                            <div
                                key={rev.id}
                                className="space-y-2 rounded-xl border p-3 transition"
                                style={{
                                    borderColor: active ? theme.accent.base : softBorder,
                                    background: active ? theme.accent.soft : theme.node.panel,
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold">{rev.label}</span>
                                    <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: theme.glass.inset, color: theme.node.muted }}>
                                        {rev.mode === "dynamic" ? "动态预演" : "静态预演"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 font-mono text-[10px]" style={{ color: theme.node.muted }}>
                                    <Clock className="size-3" />
                                    {new Date(rev.savedAt).toLocaleString()}
                                </div>
                                <div className="flex gap-1.5 pt-1">
                                    <button
                                        type="button"
                                        className="flex-1 rounded-lg border py-1 text-[11px] font-medium hover:border-[#37d39b]"
                                        style={{ borderColor: softBorder }}
                                        onClick={() => onPreview(active ? null : rev)}
                                    >
                                        {active ? "退出预览" : "只读预览"}
                                    </button>
                                    <button
                                        type="button"
                                        className="flex-1 rounded-lg py-1 text-[11px] font-semibold text-white"
                                        style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                        onClick={() => onRestore(rev)}
                                    >
                                        恢复此版本
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

/** 「镜头素材」抽屉（全选 / 单张大图预览 / 删除 / 下载 / 添加到画布） */
export function DirectorMediaDrawer({
    theme,
    snapshots,
    sending,
    onDeleteIds,
    onAddToCanvas,
    onClose,
}: {
    theme: CanvasTheme;
    snapshots: DirectorSnapshot[];
    sending: boolean;
    onDeleteIds: (ids: string[]) => void;
    onAddToCanvas: (selected: DirectorSnapshot[]) => void;
    onClose: () => void;
}) {
    const [selectedIds, setSelectedIds] = useState<string[]>(() => snapshots.map((s) => s.id));
    const [lightbox, setLightbox] = useState<DirectorSnapshot | null>(null);
    const softBorder = theme.glass.insetBorder;

    const validSelected = selectedIds.filter((id) => snapshots.some((s) => s.id === id));
    const allSelected = snapshots.length > 0 && validSelected.length === snapshots.length;

    const toggleAll = () => setSelectedIds(allSelected ? [] : snapshots.map((s) => s.id));
    const toggleOne = (id: string) =>
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const downloadSelected = () => {
        snapshots
            .filter((s) => validSelected.includes(s.id))
            .forEach((s) => {
                const a = document.createElement("a");
                a.href = s.dataUrl;
                a.download = `${s.title}.png`;
                a.click();
            });
    };

    return (
        <>
            <div
                className="fixed inset-y-14 right-4 z-[165] flex w-[360px] flex-col overflow-hidden rounded-2xl border text-xs shadow-2xl"
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
            >
                <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: softBorder }}>
                    <div className="font-semibold">镜头素材 ({snapshots.length})</div>
                    <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={onClose}>
                        <X className="size-4" />
                    </button>
                </div>

                {snapshots.length > 0 && (
                    <div className="flex items-center justify-between border-b px-4 py-2 text-[11px]" style={{ borderColor: softBorder }}>
                        <button type="button" className="inline-flex items-center gap-1.5 font-medium" onClick={toggleAll}>
                            <span
                                className="grid size-4 place-items-center rounded border"
                                style={{
                                    borderColor: allSelected ? theme.accent.base : softBorder,
                                    background: allSelected ? theme.accent.base : "transparent",
                                    color: "#fff",
                                }}
                            >
                                {allSelected && <Check className="size-3" />}
                            </span>
                            全选 ({validSelected.length}/{snapshots.length})
                        </button>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                disabled={!validSelected.length}
                                title="下载选中照片"
                                className="grid size-7 place-items-center rounded-lg border disabled:opacity-35 hover:border-[#37d39b]"
                                style={{ borderColor: softBorder }}
                                onClick={downloadSelected}
                            >
                                <Download className="size-3.5" />
                            </button>
                            <button
                                type="button"
                                disabled={!validSelected.length}
                                title="删除选中照片"
                                className="grid size-7 place-items-center rounded-lg border text-red-400 disabled:opacity-35 hover:border-red-400"
                                style={{ borderColor: softBorder }}
                                onClick={() => {
                                    onDeleteIds(validSelected);
                                    setSelectedIds([]);
                                }}
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    {snapshots.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-8 text-center text-[11px]" style={{ borderColor: softBorder, color: theme.node.muted }}>
                            还没有拍摄任何镜头。点击顶部「拍摄」按钮即可在取景器中捕获高清机位构图。
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                            {snapshots.map((snap) => {
                                const checked = validSelected.includes(snap.id);
                                return (
                                    <div
                                        key={snap.id}
                                        className="group relative overflow-hidden rounded-xl border transition"
                                        style={{
                                            borderColor: checked ? theme.accent.base : softBorder,
                                            background: theme.node.panel,
                                        }}
                                    >
                                        <div className="relative cursor-pointer" onClick={() => toggleOne(snap.id)}>
                                            <img src={snap.dataUrl} alt={snap.title} className="aspect-video w-full object-cover" />
                                            <span
                                                className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-md border"
                                                style={{
                                                    borderColor: checked ? theme.accent.base : "rgba(255,255,255,0.45)",
                                                    background: checked ? theme.accent.base : "rgba(0,0,0,0.45)",
                                                    color: "#fff",
                                                }}
                                            >
                                                {checked && <Check className="size-3" />}
                                            </span>
                                            <button
                                                type="button"
                                                title="全屏预览"
                                                className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setLightbox(snap);
                                                }}
                                            >
                                                <Maximize2 className="size-3" />
                                            </button>
                                        </div>
                                        <div className="px-2 py-1.5">
                                            <div className="truncate font-semibold">{snap.title}</div>
                                            <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>
                                                {snap.cameraName} · {snap.aspectRatio}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="border-t p-3" style={{ borderColor: softBorder }}>
                    <button
                        type="button"
                        disabled={!validSelected.length || sending}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                        style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                        onClick={() => onAddToCanvas(snapshots.filter((s) => validSelected.includes(s.id)))}
                    >
                        {sending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        添加到画布 ({validSelected.length})
                    </button>
                </div>
            </div>

            {lightbox && (
                <div
                    className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-8 backdrop-blur-xs"
                    onClick={() => setLightbox(null)}
                >
                    <div className="relative max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
                        <img src={lightbox.dataUrl} alt={lightbox.title} className="max-h-[82dvh] rounded-2xl border border-white/15 shadow-2xl" />
                        <div className="mt-2 flex items-center justify-between text-xs text-white/85">
                            <span>
                                {lightbox.title} · {lightbox.cameraName} ({lightbox.aspectRatio})
                            </span>
                            <button type="button" className="rounded-lg bg-white/10 px-3 py-1 hover:bg-white/20" onClick={() => setLightbox(null)}>
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

/** 动态预演「导出视频」弹窗（支持分镜编排/单机位、简化角色外形、1280/1920px、24-60 FPS、下载或发送到画布） */
export function DirectorExportVideoModal({
    theme,
    state,
    onExport,
    onClose,
}: {
    theme: CanvasTheme;
    state: DirectorStageState;
    onExport: (opts: {
        source: "storyboard" | string;
        simplifiedCharacters: boolean;
        longEdge: 1280 | 1920;
        fps: number;
        destination: "download" | "canvas";
        onProgress: (pct: number) => void;
    }) => Promise<void>;
    onClose: () => void;
}) {
    const [source, setSource] = useState<"storyboard" | string>(
        state.timeline?.storyboardCuts?.length ? "storyboard" : state.cameras[0]?.id || "storyboard",
    );
    const [simplifiedCharacters, setSimplifiedCharacters] = useState(true);
    const [longEdge, setLongEdge] = useState<1280 | 1920>(1280);
    const [fps, setFps] = useState<number>(state.timeline?.fps || 30);
    const [exporting, setExporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const softBorder = theme.glass.insetBorder;

    const run = async (destination: "download" | "canvas") => {
        if (exporting) return;
        setExporting(true);
        setProgress(1);
        try {
            await onExport({ source, simplifiedCharacters, longEdge, fps, destination, onProgress: setProgress });
            onClose();
        } finally {
            setExporting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget && !exporting) onClose();
            }}
        >
            <div
                className="w-full max-w-md space-y-4 rounded-2xl border p-5 text-xs shadow-2xl"
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <Film className="size-4" style={{ color: theme.accent.base }} />
                        导出预演视频
                    </div>
                    {!exporting && (
                        <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={onClose}>
                            <X className="size-4" />
                        </button>
                    )}
                </div>

                <label className="block space-y-1">
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>机位来源</span>
                    <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="h-8 w-full rounded-xl border px-2.5 outline-none"
                        style={{ borderColor: softBorder, background: theme.glass.inset, color: theme.node.text }}
                    >
                        <option value="storyboard" style={{ background: theme.node.panel }}>
                            分镜编排（自动按分镜轨切换机位）
                        </option>
                        {state.cameras.map((c) => (
                            <option key={c.id} value={c.id} style={{ background: theme.node.panel }}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3"
                    style={{
                        borderColor: simplifiedCharacters ? theme.accent.base : softBorder,
                        background: simplifiedCharacters ? theme.accent.soft : theme.glass.inset,
                    }}
                >
                    <input
                        type="checkbox"
                        checked={simplifiedCharacters}
                        onChange={(e) => setSimplifiedCharacters(e.target.checked)}
                        className="mt-0.5 accent-[#0ea977]"
                    />
                    <div className="space-y-0.5">
                        <div className="font-semibold">简化角色外形（推荐）</div>
                        <div className="text-[10px] leading-relaxed" style={{ color: theme.node.muted }}>
                            用无四肢的简化人体替代角色，更适合为视频生成模型提供构图与走位参考。
                        </div>
                    </div>
                </label>

                <div className="space-y-1.5">
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>清晰度</span>
                    <div className="grid grid-cols-2 gap-2">
                        {(
                            [
                                [1280, "标准 · 长边 1280 px"],
                                [1920, "高清 · 长边 1920 px"],
                            ] as const
                        ).map(([val, lbl]) => (
                            <button
                                key={val}
                                type="button"
                                className="rounded-xl border py-2 font-medium transition"
                                style={{
                                    borderColor: longEdge === val ? theme.accent.base : softBorder,
                                    background: longEdge === val ? theme.accent.soft : theme.node.panel,
                                    color: longEdge === val ? theme.accent.base : theme.node.text,
                                }}
                                onClick={() => setLongEdge(val)}
                            >
                                {lbl}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>帧率（FPS）</span>
                    <div className="grid grid-cols-5 gap-1.5">
                        {[24, 25, 30, 50, 60].map((f) => (
                            <button
                                key={f}
                                type="button"
                                className="rounded-lg border py-1.5 font-mono font-medium transition"
                                style={{
                                    borderColor: fps === f ? theme.accent.base : softBorder,
                                    background: fps === f ? theme.accent.soft : theme.node.panel,
                                    color: fps === f ? theme.accent.base : theme.node.text,
                                }}
                                onClick={() => setFps(f)}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                <p className="text-[10px]" style={{ color: theme.node.muted }}>
                    成片不包含辅助线、控制点或编辑界面。
                </p>

                {exporting && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                            <span>正在离屏渲染三维帧…</span>
                            <span className="font-mono">{progress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full bg-[#37d39b] transition-all" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}

                <div className="flex gap-2 pt-1">
                    <button
                        type="button"
                        disabled={exporting}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border font-semibold disabled:opacity-40 hover:border-[#37d39b]"
                        style={{ borderColor: softBorder }}
                        onClick={() => void run("download")}
                    >
                        <Download className="size-3.5" />
                        下载视频
                    </button>
                    <button
                        type="button"
                        disabled={exporting}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl font-semibold text-white disabled:opacity-40"
                        style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                        onClick={() => void run("canvas")}
                    >
                        {exporting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        发送到画布
                    </button>
                </div>
            </div>
        </div>
    );
}
