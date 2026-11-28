import { useMemo, useState } from "react";
import {
    Camera,
    ChevronDown,
    ChevronRight,
    Diamond,
    Eye,
    EyeOff,
    Film,
    Pause,
    Play,
    Plus,
    Repeat,
    Route,
    Trash2,
    User,
    Video,
    X,
} from "lucide-react";
import { nanoid } from "nanoid";
import { canvasGlass, type CanvasTheme } from "@/lib/canvas-theme";
import {
    buildCameraMotionKeyframes,
    DIRECTOR_ACTION_PRESETS,
    DIRECTOR_CAMERA_MOTIONS,
} from "@/lib/canvas/director/presets";
import type {
    DirectorActionClip,
    DirectorCameraItem,
    DirectorCharacterItem,
    DirectorKeyframe,
    DirectorStageState,
    DirectorStoryboardCut,
    DirectorTimelineState,
} from "@/types/canvas";

type Props = {
    theme: CanvasTheme;
    state: DirectorStageState;
    currentTime: number;
    playing: boolean;
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
    onUpdateTimeline: (patch: Partial<DirectorTimelineState>) => void;
    onUpdateCharacter: (id: string, patch: Partial<DirectorCharacterItem>) => void;
    onStartPathDraw: (kind: "camera_pos" | "camera_target" | "character_walk" | "character_move", objectId: string, label: string) => void;
    onToggleKeyframe: (objectId: string, property: DirectorKeyframe["property"], value: DirectorKeyframe["value"]) => void;
};

function formatTimecode(sec: number, fps: number) {
    const clamped = Math.max(0, sec);
    const m = Math.floor(clamped / 60);
    const s = Math.floor(clamped % 60);
    const cs = Math.floor((clamped % 1) * 100);
    const frame = Math.floor(clamped * fps);
    return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")} · ${frame}f`;
}

export function DirectorTimeline({
    theme,
    state,
    currentTime,
    playing,
    onSeek,
    onTogglePlay,
    onUpdateTimeline,
    onUpdateCharacter,
    onStartPathDraw,
    onToggleKeyframe,
}: Props) {
    const tl = state.timeline!;
    const [collapsed, setCollapsed] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [expandedTracks, setExpandedTracks] = useState<Record<string, boolean>>({});
    const [addMenu, setAddMenu] = useState<{ kind: "camera" | "character"; id: string } | null>(null);
    const [camMotionModal, setCamMotionModal] = useState<DirectorCameraItem | null>(null);
    const [camMotionDur, setCamMotionDur] = useState(4);
    const [charActionModal, setCharActionModal] = useState<DirectorCharacterItem | null>(null);
    const [charActionTab, setCharActionTab] = useState<"action" | "pose">("action");
    const [charActionDur, setCharActionDur] = useState(4);
    const [storyPickerOpen, setStoryPickerOpen] = useState(false);

    const softBorder = theme.glass.insetBorder;
    const pxPerSec = 56 * zoom;
    const timelineWidth = Math.max(640, Math.ceil(tl.duration * pxPerSec) + 40);

    const hasTrackContent = (objId: string) =>
        tl.keyframes.some((k) => k.objectId === objId) || tl.actionClips.some((c) => c.characterId === objId);

    const visibleCameras = useMemo(
        () => (tl.hideEmptyTracks ? state.cameras.filter((c) => hasTrackContent(c.id)) : state.cameras),
        [state.cameras, tl.hideEmptyTracks, tl.keyframes],
    );
    const visibleCharacters = useMemo(
        () => (tl.hideEmptyTracks ? state.characters.filter((c) => hasTrackContent(c.id)) : state.characters),
        [state.characters, tl.hideEmptyTracks, tl.keyframes, tl.actionClips],
    );

    const allActions = [...DIRECTOR_ACTION_PRESETS, ...(state.customActions || [])];

    const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, e.clientX - rect.left);
        onSeek(Math.min(tl.duration, Math.round((x / pxPerSec) * 100) / 100));
    };

    const addStoryboardCut = (cam: DirectorCameraItem) => {
        const existing = tl.storyboardCuts || [];
        const lastEnd = existing.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
        const start = lastEnd < tl.duration - 0.5 ? lastEnd : currentTime;
        const cut: DirectorStoryboardCut = {
            id: nanoid(),
            cameraId: cam.id,
            startTime: Math.round(start * 100) / 100,
            duration: Math.min(2, Math.max(0.5, tl.duration - start)),
            label: cam.name,
        };
        onUpdateTimeline({ storyboardCuts: [...existing, cut] });
        setStoryPickerOpen(false);
    };

    const deleteKeyframe = (kfId: string) => {
        onUpdateTimeline({ keyframes: tl.keyframes.filter((k) => k.id !== kfId) });
    };

    const applyCameraMotion = (motionId: string) => {
        if (!camMotionModal) return;
        const kfs = buildCameraMotionKeyframes(camMotionModal, motionId, currentTime, Math.max(0.5, camMotionDur));
        const endT = currentTime + camMotionDur;
        const cleaned = tl.keyframes.filter(
            (k) => !(k.objectId === camMotionModal.id && k.time >= currentTime - 0.05 && k.time <= endT + 0.05),
        );
        onUpdateTimeline({ keyframes: [...cleaned, ...kfs] });
        setCamMotionModal(null);
    };

    const addCharacterActionClip = (actionId: string, actionName: string) => {
        if (!charActionModal) return;
        const clip: DirectorActionClip = {
            id: nanoid(),
            characterId: charActionModal.id,
            actionId,
            actionName,
            mode: charActionTab,
            startTime: Math.round(currentTime * 100) / 100,
            duration: Math.max(0.5, Math.min(tl.duration - currentTime, charActionDur)),
            poseFrame: charActionTab === "pose" ? 0.35 : undefined,
        };
        onUpdateTimeline({ actionClips: [...tl.actionClips, clip] });
        setCharActionModal(null);
    };

    const ticks = useMemo(() => {
        const step = zoom >= 1.5 ? 0.5 : zoom >= 0.75 ? 1 : 2;
        const arr: number[] = [];
        for (let t = 0; t <= tl.duration + 0.001; t += step) arr.push(Math.round(t * 10) / 10);
        return arr;
    }, [tl.duration, zoom]);

    return (
        <>
            <section
                className="flex shrink-0 flex-col border-t text-xs select-none"
                style={{
                    ...canvasGlass(theme),
                    backgroundColor: theme.toolbar.panel,
                    borderColor: softBorder,
                    color: theme.node.text,
                    height: collapsed ? 40 : 228,
                }}
            >
                {/* 顶部播放与参数控制条 */}
                <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: softBorder }}>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-white/10"
                        onClick={() => setCollapsed((v) => !v)}
                    >
                        <Film className="size-3.5" style={{ color: theme.accent.base }} />
                        <span>时间轴</span>
                        {collapsed ? <ChevronRight className="size-3.5 opacity-60" /> : <ChevronDown className="size-3.5 opacity-60" />}
                    </button>

                    <button
                        type="button"
                        title={playing ? "暂停" : "播放"}
                        className="grid size-7 place-items-center rounded-lg text-white transition hover:brightness-110"
                        style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                        onClick={onTogglePlay}
                    >
                        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </button>
                    <button
                        type="button"
                        title="循环播放时间轴"
                        className="grid size-7 place-items-center rounded-lg transition hover:bg-white/10"
                        style={tl.loop ? { background: theme.accent.soft, color: theme.accent.base } : { color: theme.node.muted }}
                        onClick={() => onUpdateTimeline({ loop: !tl.loop })}
                    >
                        <Repeat className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        title="隐藏无动画对象轨道"
                        className="grid size-7 place-items-center rounded-lg transition hover:bg-white/10"
                        style={tl.hideEmptyTracks ? { background: theme.accent.soft, color: theme.accent.base } : { color: theme.node.muted }}
                        onClick={() => onUpdateTimeline({ hideEmptyTracks: !tl.hideEmptyTracks })}
                    >
                        {tl.hideEmptyTracks ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>

                    <div className="rounded-lg px-2.5 py-1 font-mono text-[11px]" style={{ background: theme.glass.inset }}>
                        <span style={{ color: theme.accent.base }}>{formatTimecode(currentTime, tl.fps)}</span>
                        <span className="opacity-50"> / 0:{String(tl.duration).padStart(2, "0")}.0</span>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }}>
                            <span>帧率</span>
                            <select
                                value={tl.fps}
                                onChange={(e) => onUpdateTimeline({ fps: Number(e.target.value) as DirectorTimelineState["fps"] })}
                                className="h-6 rounded-lg border px-1.5 font-mono text-[11px] outline-none"
                                style={{ borderColor: softBorder, background: theme.glass.inset, color: theme.node.text }}
                            >
                                {[24, 25, 30, 50, 60].map((f) => (
                                    <option key={f} value={f} style={{ background: theme.node.panel }}>
                                        {f}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }}>
                            <span>总时长</span>
                            <input
                                type="number"
                                min={2}
                                max={60}
                                value={tl.duration}
                                onChange={(e) => onUpdateTimeline({ duration: Math.max(2, Math.min(60, Number(e.target.value) || 20)) })}
                                className="h-6 w-12 rounded-lg border px-1.5 text-center font-mono text-[11px] outline-none"
                                style={{ borderColor: softBorder, background: theme.glass.inset, color: theme.node.text }}
                            />
                            <span>秒</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                            <button type="button" className="grid size-5 place-items-center rounded hover:bg-white/10" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>
                                −
                            </button>
                            <input type="range" min={0.5} max={2.5} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20 accent-[#0ea977]" />
                            <button type="button" className="grid size-5 place-items-center rounded hover:bg-white/10" onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}>
                                +
                            </button>
                            <span className="w-8 font-mono text-[10px]" style={{ color: theme.node.muted }}>
                                {zoom}×
                            </span>
                        </div>
                    </div>
                </div>

                {/* 轨道主体 */}
                {!collapsed && (
                    <div className="flex min-h-0 flex-1 overflow-hidden">
                        {/* 左侧轨道名称列 */}
                        <div data-node-scroll className="thin-scrollbar w-52 shrink-0 overflow-y-auto border-r" style={{ borderColor: softBorder }}>
                            <div className="flex h-6 items-center border-b px-3 text-[10px]" style={{ borderColor: softBorder, color: theme.node.muted }}>
                                当前时间
                            </div>

                            {/* 机位轨道 */}
                            {visibleCameras.map((cam) => {
                                const open = expandedTracks[cam.id] ?? false;
                                return (
                                    <div key={cam.id} className="border-b" style={{ borderColor: softBorder }}>
                                        <div className="relative flex h-8 items-center gap-1 px-2">
                                            <button type="button" className="opacity-65 hover:opacity-100" onClick={() => setExpandedTracks((m) => ({ ...m, [cam.id]: !open }))}>
                                                {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                                            </button>
                                            <Camera className="size-3 shrink-0" style={{ color: theme.accent.base }} />
                                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{cam.name}</span>
                                            <button
                                                type="button"
                                                title="添加运镜或路径"
                                                className="grid size-5 place-items-center rounded hover:bg-white/10"
                                                onClick={() => setAddMenu(addMenu?.id === cam.id ? null : { kind: "camera", id: cam.id })}
                                            >
                                                <Plus className="size-3" />
                                            </button>
                                            {addMenu?.kind === "camera" && addMenu.id === cam.id && (
                                                <div
                                                    className="absolute top-full right-1 z-30 w-36 rounded-xl border p-1 shadow-2xl"
                                                    style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel }}
                                                >
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                                        onClick={() => {
                                                            setCamMotionModal(cam);
                                                            setAddMenu(null);
                                                        }}
                                                    >
                                                        <Video className="size-3" style={{ color: theme.accent.base }} />
                                                        添加运镜
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                                        onClick={() => {
                                                            onStartPathDraw("camera_pos", cam.id, `绘制「${cam.name}」机位路径`);
                                                            setAddMenu(null);
                                                        }}
                                                    >
                                                        <Route className="size-3" />
                                                        绘制机位路径
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                                        onClick={() => {
                                                            onStartPathDraw("camera_target", cam.id, `绘制「${cam.name}」注视点路径`);
                                                            setAddMenu(null);
                                                        }}
                                                    >
                                                        <Route className="size-3" />
                                                        绘制注视点路径
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {open &&
                                            (
                                                [
                                                    ["position", "机位位置", cam.position],
                                                    ["target", "注视点", cam.target],
                                                    ["fov", "视野", cam.fov],
                                                    ["roll", "画面倾斜", cam.roll || 0],
                                                ] as const
                                            ).map(([prop, lbl, val]) => (
                                                <div key={prop} className="flex h-6 items-center justify-between pr-2 pl-7 text-[10px]" style={{ color: theme.node.muted }}>
                                                    <span>{lbl}</span>
                                                    <button
                                                        type="button"
                                                        title={`打 ${lbl} 关键帧`}
                                                        className="hover:text-[#37d39b]"
                                                        onClick={() => onToggleKeyframe(cam.id, prop, val)}
                                                    >
                                                        <Diamond className="size-2.5" />
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                );
                            })}

                            {/* 角色轨道 */}
                            {visibleCharacters.map((ch) => {
                                const open = expandedTracks[ch.id] ?? false;
                                return (
                                    <div key={ch.id} className="border-b" style={{ borderColor: softBorder }}>
                                        <div className="relative flex h-8 items-center gap-1 px-2">
                                            <button type="button" className="opacity-65 hover:opacity-100" onClick={() => setExpandedTracks((m) => ({ ...m, [ch.id]: !open }))}>
                                                {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                                            </button>
                                            <User className="size-3 shrink-0" style={{ color: ch.color }} />
                                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{ch.name}</span>
                                            <button
                                                type="button"
                                                title="添加动作或走位路径"
                                                className="grid size-5 place-items-center rounded hover:bg-white/10"
                                                onClick={() => setAddMenu(addMenu?.id === ch.id ? null : { kind: "character", id: ch.id })}
                                            >
                                                <Plus className="size-3" />
                                            </button>
                                            {addMenu?.kind === "character" && addMenu.id === ch.id && (
                                                <div
                                                    className="absolute top-full right-1 z-30 w-40 rounded-xl border p-1 shadow-2xl"
                                                    style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel }}
                                                >
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                                        onClick={() => {
                                                            setCharActionModal(ch);
                                                            setAddMenu(null);
                                                        }}
                                                    >
                                                        <Plus className="size-3" style={{ color: theme.accent.base }} />
                                                        添加动作到时间轴
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                                        onClick={() => {
                                                            onStartPathDraw("character_walk", ch.id, `绘制「${ch.name}」行走路径`);
                                                            setAddMenu(null);
                                                        }}
                                                    >
                                                        <Route className="size-3" />
                                                        绘制行走路径
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                                        onClick={() => {
                                                            onStartPathDraw("character_move", ch.id, `绘制「${ch.name}」移动路径`);
                                                            setAddMenu(null);
                                                        }}
                                                    >
                                                        <Route className="size-3" />
                                                        绘制移动路径
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {open && (
                                            <div className="space-y-0 text-[10px]" style={{ color: theme.node.muted }}>
                                                <div className="flex h-6 items-center justify-between pr-2 pl-7">
                                                    <span>动作</span>
                                                    <button type="button" className="hover:text-[#37d39b]" onClick={() => setCharActionModal(ch)}>
                                                        <Plus className="size-2.5" />
                                                    </button>
                                                </div>
                                                <div className="flex h-6 items-center justify-between pr-2 pl-7">
                                                    <span>位置</span>
                                                    <button type="button" className="hover:text-[#37d39b]" onClick={() => onToggleKeyframe(ch.id, "position", ch.position)}>
                                                        <Diamond className="size-2.5" />
                                                    </button>
                                                </div>
                                                <div className="flex h-6 items-center justify-between pr-2 pl-7">
                                                    <span>旋转</span>
                                                    <button
                                                        type="button"
                                                        title="沿路径自动转向"
                                                        className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                                                        style={
                                                            ch.autoFacePath
                                                                ? { background: theme.accent.soft, color: theme.accent.base }
                                                                : { background: theme.glass.inset, color: theme.node.muted }
                                                        }
                                                        onClick={() => onUpdateCharacter(ch.id, { autoFacePath: !ch.autoFacePath })}
                                                    >
                                                        自动转向
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* 分镜编排轨道标题 */}
                            <div className="relative flex h-9 items-center justify-between px-3">
                                <span className="font-semibold">分镜编排</span>
                                <button
                                    type="button"
                                    title="添加分镜"
                                    className="inline-flex h-6 items-center gap-0.5 rounded-lg px-2 text-[10px] font-semibold"
                                    style={{ background: theme.accent.soft, color: theme.accent.base }}
                                    onClick={() => setStoryPickerOpen((v) => !v)}
                                >
                                    <Plus className="size-3" />
                                    添加分镜
                                </button>
                                {storyPickerOpen && (
                                    <div
                                        className="absolute right-2 bottom-full z-30 mb-1 w-36 rounded-xl border p-1 shadow-2xl"
                                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel }}
                                    >
                                        {state.cameras.map((cam) => (
                                            <button
                                                key={cam.id}
                                                type="button"
                                                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-[#0ea977]/15"
                                                onClick={() => addStoryboardCut(cam)}
                                            >
                                                <Camera className="size-3" style={{ color: theme.accent.base }} />
                                                <span className="truncate">{cam.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 右侧时间标尺与关键帧/片段画布 */}
                        <div data-node-scroll className="thin-scrollbar relative min-w-0 flex-1 overflow-x-auto overflow-y-auto">
                            <div className="relative" style={{ width: timelineWidth }}>
                                {/* 顶部时间标尺 */}
                                <div
                                    className="relative h-6 cursor-pointer border-b"
                                    style={{ borderColor: softBorder, background: theme.glass.inset }}
                                    onClick={handleScrub}
                                >
                                    {ticks.map((t) => (
                                        <div key={t} className="absolute top-0 bottom-0 border-l border-white/15 pl-1 font-mono text-[9px] opacity-60" style={{ left: t * pxPerSec }}>
                                            {t}s
                                        </div>
                                    ))}
                                </div>

                                {/* 机位轨道关键帧点 */}
                                {visibleCameras.map((cam) => {
                                    const open = expandedTracks[cam.id] ?? false;
                                    const camKfs = tl.keyframes.filter((k) => k.objectId === cam.id);
                                    return (
                                        <div key={cam.id} className="border-b" style={{ borderColor: softBorder }}>
                                            <div className="relative h-8" onClick={handleScrub}>
                                                {camKfs.map((kf) => (
                                                    <button
                                                        key={kf.id}
                                                        type="button"
                                                        title={`${kf.property} @ ${kf.time}s（点击删除）`}
                                                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#37d39b] hover:scale-125"
                                                        style={{ left: kf.time * pxPerSec }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteKeyframe(kf.id);
                                                        }}
                                                    >
                                                        <Diamond className="size-3" fill="currentColor" />
                                                    </button>
                                                ))}
                                            </div>
                                            {open &&
                                                (["position", "target", "fov", "roll"] as const).map((prop) => (
                                                    <div key={prop} className="relative h-6 border-t border-white/5" onClick={handleScrub}>
                                                        {camKfs
                                                            .filter((k) => k.property === prop)
                                                            .map((kf) => (
                                                                <button
                                                                    key={kf.id}
                                                                    type="button"
                                                                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#38bdf8] hover:text-red-400"
                                                                    style={{ left: kf.time * pxPerSec }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        deleteKeyframe(kf.id);
                                                                    }}
                                                                >
                                                                    <Diamond className="size-2.5" fill="currentColor" />
                                                                </button>
                                                            ))}
                                                    </div>
                                                ))}
                                        </div>
                                    );
                                })}

                                {/* 角色轨道动作片段与关键帧 */}
                                {visibleCharacters.map((ch) => {
                                    const open = expandedTracks[ch.id] ?? false;
                                    const clips = tl.actionClips.filter((c) => c.characterId === ch.id);
                                    const kfs = tl.keyframes.filter((k) => k.objectId === ch.id);
                                    return (
                                        <div key={ch.id} className="border-b" style={{ borderColor: softBorder }}>
                                            <div className="relative h-8" onClick={handleScrub}>
                                                {clips.map((clip) => (
                                                    <div
                                                        key={clip.id}
                                                        className="group absolute top-1 bottom-1 flex items-center justify-between overflow-hidden rounded-md border px-2 text-[10px] font-medium"
                                                        style={{
                                                            left: clip.startTime * pxPerSec,
                                                            width: Math.max(44, clip.duration * pxPerSec),
                                                            background: "rgba(14,169,119,0.22)",
                                                            borderColor: "#37d39b",
                                                        }}
                                                    >
                                                        <span className="truncate">{clip.actionName}</span>
                                                        <button
                                                            type="button"
                                                            className="ml-1 opacity-0 hover:text-red-400 group-hover:opacity-100"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onUpdateTimeline({ actionClips: tl.actionClips.filter((c) => c.id !== clip.id) });
                                                            }}
                                                        >
                                                            <X className="size-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {kfs.map((kf) => (
                                                    <button
                                                        key={kf.id}
                                                        type="button"
                                                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-400"
                                                        style={{ left: kf.time * pxPerSec }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteKeyframe(kf.id);
                                                        }}
                                                    >
                                                        <Diamond className="size-2.5" fill="currentColor" />
                                                    </button>
                                                ))}
                                            </div>
                                            {open && <div className="h-[72px]" onClick={handleScrub} />}
                                        </div>
                                    );
                                })}

                                {/* 分镜编排片段轨 */}
                                <div className="relative flex h-9 items-center" onClick={handleScrub}>
                                    {!(tl.storyboardCuts || []).length && (
                                        <span className="pl-3 text-[11px] opacity-45">选择机位并添加分镜片段（支持多机位自动切换导出）</span>
                                    )}
                                    {(tl.storyboardCuts || []).map((cut) => (
                                        <div
                                            key={cut.id}
                                            className="group absolute top-1 bottom-1 flex items-center justify-between overflow-hidden rounded-lg border px-2 text-[10px] font-semibold"
                                            style={{
                                                left: cut.startTime * pxPerSec,
                                                width: Math.max(54, cut.duration * pxPerSec),
                                                background: "rgba(56,189,248,0.18)",
                                                borderColor: "#38bdf8",
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <span className="truncate">
                                                {cut.label || state.cameras.find((c) => c.id === cut.cameraId)?.name || "机位"} · {cut.duration.toFixed(1)}s
                                            </span>
                                            <button
                                                type="button"
                                                className="ml-1 opacity-0 hover:text-red-400 group-hover:opacity-100"
                                                onClick={() =>
                                                    onUpdateTimeline({
                                                        storyboardCuts: tl.storyboardCuts.filter((c) => c.id !== cut.id),
                                                    })
                                                }
                                            >
                                                <Trash2 className="size-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* 翡翠绿播放指针 */}
                                <div
                                    className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-[#37d39b]"
                                    style={{ left: currentTime * pxPerSec }}
                                >
                                    <div className="absolute -top-0.5 -left-1.5 size-3.5 rotate-45 rounded-xs bg-[#37d39b]" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* 「添加运镜」弹窗（3 种自定义路径 + 14 种运镜预设） */}
            {camMotionModal && (
                <div
                    className="fixed inset-0 z-[165] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) setCamMotionModal(null);
                    }}
                >
                    <div
                        className="w-full max-w-xl space-y-4 rounded-2xl border p-5 text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold">添加运镜 · {camMotionModal.name}</div>
                                <div className="text-[11px]" style={{ color: theme.node.muted }}>
                                    从当前时间 {currentTime.toFixed(1)}s 起生成平滑三维运镜轨迹
                                </div>
                            </div>
                            <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={() => setCamMotionModal(null)}>
                                <X className="size-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: theme.glass.inset }}>
                            <span>运镜时长</span>
                            <input type="range" min={1} max={12} step={0.5} value={camMotionDur} onChange={(e) => setCamMotionDur(Number(e.target.value))} className="flex-1 accent-[#0ea977]" />
                            <span className="w-10 text-right font-mono">{camMotionDur}s</span>
                        </div>

                        <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold" style={{ color: theme.node.muted }}>自定义路径</div>
                            <div className="grid grid-cols-3 gap-2">
                                {(
                                    [
                                        ["camera_pos", "固定注视点", "绘制机位移动轨迹"],
                                        ["camera_target", "固定机位", "绘制注视点扫视轨迹"],
                                        ["camera_pos", "自由运镜", "自定义机位与注视点"],
                                    ] as const
                                ).map(([kind, lbl, desc]) => (
                                    <button
                                        key={lbl}
                                        type="button"
                                        className="rounded-xl border p-2.5 text-left transition hover:border-[#37d39b]"
                                        style={{ borderColor: softBorder, background: theme.node.panel }}
                                        onClick={() => {
                                            onStartPathDraw(kind, camMotionModal.id, `${lbl}：绘制「${camMotionModal.name}」路径`);
                                            setCamMotionModal(null);
                                        }}
                                    >
                                        <div className="font-semibold">{lbl}</div>
                                        <div className="mt-0.5 text-[10px]" style={{ color: theme.node.muted }}>{desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-[11px] font-semibold" style={{ color: theme.node.muted }}>固定注视点（10 种）</div>
                            <div className="grid grid-cols-5 gap-1.5">
                                {DIRECTOR_CAMERA_MOTIONS.filter((m) => m.group === "fixed_target").map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        title={m.desc}
                                        className="rounded-xl border px-2 py-2 text-center font-medium transition hover:border-[#37d39b] hover:text-[#37d39b]"
                                        style={{ borderColor: softBorder, background: theme.node.panel }}
                                        onClick={() => applyCameraMotion(m.id)}
                                    >
                                        {m.name}
                                    </button>
                                ))}
                            </div>
                            <div className="pt-1 text-[11px] font-semibold" style={{ color: theme.node.muted }}>固定机位（4 种）</div>
                            <div className="grid grid-cols-4 gap-1.5">
                                {DIRECTOR_CAMERA_MOTIONS.filter((m) => m.group === "fixed_camera").map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        title={m.desc}
                                        className="rounded-xl border px-2 py-2 text-center font-medium transition hover:border-[#37d39b] hover:text-[#37d39b]"
                                        style={{ borderColor: softBorder, background: theme.node.panel }}
                                        onClick={() => applyCameraMotion(m.id)}
                                    >
                                        {m.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 「添加动作到时间轴」弹窗（动作 / 静态姿势 双 Tab） */}
            {charActionModal && (
                <div
                    className="fixed inset-0 z-[165] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) setCharActionModal(null);
                    }}
                >
                    <div
                        className="flex h-[min(70dvh,540px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                    >
                        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: softBorder }}>
                            <div className="text-sm font-semibold">添加动作到时间轴 · {charActionModal.name}</div>
                            <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={() => setCharActionModal(null)}>
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: softBorder }}>
                            <div className="inline-flex rounded-lg p-0.5" style={{ background: theme.glass.inset }}>
                                <button
                                    type="button"
                                    className="rounded-md px-3 py-1 font-semibold"
                                    style={charActionTab === "action" ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                    onClick={() => setCharActionTab("action")}
                                >
                                    动作
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md px-3 py-1 font-semibold"
                                    style={charActionTab === "pose" ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                    onClick={() => setCharActionTab("pose")}
                                >
                                    静态姿势
                                </button>
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }}>
                                <span>片段时长</span>
                                <input
                                    type="number"
                                    min={0.5}
                                    max={20}
                                    step={0.5}
                                    value={charActionDur}
                                    onChange={(e) => setCharActionDur(Math.max(0.5, Number(e.target.value) || 3))}
                                    className="h-7 w-14 rounded-lg border px-2 font-mono outline-none"
                                    style={{ borderColor: softBorder, background: theme.glass.inset, color: theme.node.text }}
                                />
                                <span>秒</span>
                            </label>
                        </div>
                        <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                            <div className="grid grid-cols-3 gap-2">
                                {allActions.map((act) => (
                                    <button
                                        key={act.id}
                                        type="button"
                                        className="rounded-xl border px-2.5 py-2 text-left transition hover:border-[#37d39b]"
                                        style={{ borderColor: softBorder, background: theme.node.panel }}
                                        onClick={() => addCharacterActionClip(act.id, act.name)}
                                    >
                                        <div className="truncate font-semibold">{act.name}</div>
                                        <div className="text-[10px]" style={{ color: theme.node.muted }}>
                                            {act.durationSec}s
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
