import { useMemo, useRef, useState } from "react";
import {
    Aperture,
    Box,
    Camera,
    ChevronDown,
    ChevronRight,
    Copy,
    Crosshair,
    Diamond,
    Eye,
    EyeOff,
    Focus,
    Lock,
    PanelRightClose,
    Plus,
    RotateCcw,
    Search,
    Sliders,
    Sparkles,
    Trash2,
    Unlock,
    Upload,
    User,
    X,
} from "lucide-react";
import { nanoid } from "nanoid";
import { canvasGlass, type CanvasTheme } from "@/lib/canvas-theme";
import {
    DIRECTOR_ACTION_PRESETS,
    DIRECTOR_ASPECT_RATIOS,
    DIRECTOR_ENVIRONMENT_PRESETS,
    DIRECTOR_JOINT_GROUPS,
    emptyJoints,
    normalizeJoints,
    sampleActionPose,
    synthesizeActionFromText,
} from "@/lib/canvas/director/presets";
import { toScale3 } from "@/lib/canvas/director/scene-builders";
import type {
    DirectorCameraItem,
    DirectorCharacterItem,
    DirectorCustomAction,
    DirectorEnvironment,
    DirectorKeyframe,
    DirectorPropItem,
    DirectorStageState,
    PoseJoints25,
} from "@/types/canvas";
import type { SelectedEntity } from "./DirectorViewport";

type Props = {
    theme: CanvasTheme;
    state: DirectorStageState;
    selected: SelectedEntity;
    currentTime: number;
    poseEditMode: boolean;
    activeJointGroup: string;
    onSelect: (sel: SelectedEntity) => void;
    onCollapse: () => void;
    onFocusPosition: (pos: [number, number, number]) => void;
    onSetPipCamera: (camId: string) => void;
    onDuplicateEntity: (kind: "character" | "prop" | "camera", id: string) => void;
    onDeleteEntity: (kind: "character" | "prop" | "camera", id: string) => void;
    onUpdateCharacter: (id: string, patch: Partial<DirectorCharacterItem>) => void;
    onUpdateProp: (id: string, patch: Partial<DirectorPropItem>) => void;
    onUpdateCamera: (id: string, patch: Partial<DirectorCameraItem>) => void;
    onUpdateEnvironment: (patch: Partial<DirectorEnvironment>) => void;
    onTogglePoseEditMode: (v: boolean) => void;
    onSelectJointGroup: (groupId: string) => void;
    onAddCustomAction: (action: DirectorCustomAction) => void;
    onToggleKeyframe: (
        objectId: string,
        property: DirectorKeyframe["property"],
        value: DirectorKeyframe["value"],
    ) => void;
};

function Vec3Row({
    theme,
    label,
    unit,
    value,
    step = 0.1,
    onChange,
    showKeyframe,
    hasKeyframe,
    onToggleKeyframe,
}: {
    theme: CanvasTheme;
    label: string;
    unit: string;
    value: [number, number, number];
    step?: number;
    onChange: (next: [number, number, number]) => void;
    showKeyframe?: boolean;
    hasKeyframe?: boolean;
    onToggleKeyframe?: () => void;
}) {
    const axes = [
        ["X", "#f43f5e"],
        ["Y", "#37d39b"],
        ["Z", "#38bdf8"],
    ] as const;
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]" style={{ color: theme.node.muted }}>
                <span>{label}</span>
                {showKeyframe && onToggleKeyframe && (
                    <button
                        type="button"
                        title="在当前时间点添加/删除关键帧"
                        className="rounded p-0.5 transition hover:bg-white/10"
                        style={{ color: hasKeyframe ? theme.accent.base : theme.node.muted }}
                        onClick={onToggleKeyframe}
                    >
                        <Diamond className="size-3" fill={hasKeyframe ? "currentColor" : "none"} />
                    </button>
                )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
                {axes.map(([ax, col], idx) => (
                    <label
                        key={ax}
                        className="flex h-7 items-center gap-1 rounded-lg border px-1.5"
                        style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }}
                    >
                        <span className="text-[10px] font-bold" style={{ color: col }}>
                            {ax}
                        </span>
                        <input
                            type="number"
                            step={step}
                            value={Number.isFinite(value[idx]) ? value[idx] : 0}
                            onChange={(e) => {
                                const next: [number, number, number] = [...value];
                                next[idx] = Number(e.target.value) || 0;
                                onChange(next);
                            }}
                            className="w-full min-w-0 bg-transparent font-mono text-[11px] outline-none"
                            style={{ color: theme.node.text }}
                        />
                        {unit && (
                            <span className="text-[9px] opacity-45" style={{ color: theme.node.muted }}>
                                {unit}
                            </span>
                        )}
                    </label>
                ))}
            </div>
        </div>
    );
}

function ToggleSwitch({
    checked,
    onChange,
    accent,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    accent: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            className="relative h-5 w-9 rounded-full transition"
            style={{ background: checked ? accent : "rgba(128,138,154,0.32)" }}
            onClick={() => onChange(!checked)}
        >
            <span
                className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
            />
        </button>
    );
}

export function DirectorInspector({
    theme,
    state,
    selected,
    currentTime,
    poseEditMode,
    activeJointGroup,
    onSelect,
    onCollapse,
    onFocusPosition,
    onSetPipCamera,
    onDuplicateEntity,
    onDeleteEntity,
    onUpdateCharacter,
    onUpdateProp,
    onUpdateCamera,
    onUpdateEnvironment,
    onTogglePoseEditMode,
    onSelectJointGroup,
    onAddCustomAction,
    onToggleKeyframe,
}: Props) {
    const [search, setSearch] = useState("");
    const [expandedCams, setExpandedCams] = useState<Record<string, boolean>>({});
    const [charSubTab, setCharSubTab] = useState<"object" | "pose">("object");
    const [openJointGroups, setOpenJointGroups] = useState<Record<string, boolean>>({
        body: true,
        chest: false,
        head: true,
        leftArm: true,
        rightArm: true,
        leftLeg: false,
        rightLeg: false,
    });
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        kind: "character" | "prop" | "camera";
        id: string;
    } | null>(null);

    // 预设姿势 / 动作素材库弹窗
    const [poseLibOpen, setPoseLibOpen] = useState(false);
    const [poseLibTab, setPoseLibTab] = useState<"preset" | "mine">("preset");
    const [poseSearch, setPoseSearch] = useState("");
    const [poseCat, setPoseCat] = useState<string>("全部");
    const [pickedActionId, setPickedActionId] = useState<string>("stand_idle");
    const [pickedFrame, setPickedFrame] = useState<number>(0.35);

    // 新建动作（文字生成 / 视频转动作 / 导入 FBX）弹窗
    const [newActOpen, setNewActOpen] = useState(false);
    const [newActMode, setNewActMode] = useState<"text" | "video" | "fbx">("text");
    const [newActName, setNewActName] = useState("");
    const [newActDesc, setNewActDesc] = useState("");
    const [newActFile, setNewActFile] = useState<File | null>(null);
    const newActFileRef = useRef<HTMLInputElement>(null);

    const softBorder = theme.glass.insetBorder;
    const isDynamic = state.mode === "dynamic";
    const env = state.environment || DIRECTOR_ENVIRONMENT_PRESETS.studio.env;
    const q = search.trim().toLowerCase();

    const filteredCams = state.cameras.filter((c) => !q || c.name.toLowerCase().includes(q));
    const filteredChars = state.characters.filter((c) => !q || c.name.toLowerCase().includes(q));
    const filteredProps = (state.props || []).filter((p) => !q || p.name.toLowerCase().includes(q));

    const selectedChar = selected?.kind === "character" ? state.characters.find((c) => c.id === selected.id) : undefined;
    const selectedProp = selected?.kind === "prop" ? (state.props || []).find((p) => p.id === selected.id) : undefined;
    const selectedCam =
        selected?.kind === "camera" || selected?.kind === "target"
            ? state.cameras.find((c) => c.id === selected.id)
            : undefined;

    const hasKf = (objectId: string, prop: DirectorKeyframe["property"]) =>
        Boolean(
            state.timeline?.keyframes?.some(
                (k) => k.objectId === objectId && k.property === prop && Math.abs(k.time - currentTime) < 0.08,
            ),
        );

    const allActions = useMemo(
        () => [...DIRECTOR_ACTION_PRESETS, ...(state.customActions || [])],
        [state.customActions],
    );
    const filteredPresetActions = useMemo(
        () =>
            DIRECTOR_ACTION_PRESETS.filter(
                (a) =>
                    (poseCat === "全部" || a.category === poseCat) &&
                    (!poseSearch.trim() || a.name.toLowerCase().includes(poseSearch.trim().toLowerCase())),
            ),
        [poseCat, poseSearch],
    );
    const filteredCustomActions = useMemo(
        () =>
            (state.customActions || []).filter(
                (a) => !poseSearch.trim() || a.name.toLowerCase().includes(poseSearch.trim().toLowerCase()),
            ),
        [state.customActions, poseSearch],
    );

    const applyPickedPoseFrame = (actionId: string, frameRatio: number) => {
        if (!selectedChar) return;
        const act = allActions.find((a) => a.id === actionId);
        if (!act) return;
        onUpdateCharacter(selectedChar.id, {
            pose: act.name,
            poseActionId: act.id,
            poseFrame: frameRatio,
            joints: sampleActionPose(act, frameRatio),
        });
    };

    const handleCreateNewAction = () => {
        const name = newActName.trim() || (newActMode === "text" ? "文字动作" : newActMode === "video" ? "视频动作" : "FBX 动作");
        let created: DirectorCustomAction;
        if (newActMode === "text") {
            created = synthesizeActionFromText(name, newActDesc);
        } else {
            // 视频转动作 / FBX 动作导入 -> 生成可直接应用于时间轴与姿势库的动作片段
            created = {
                ...synthesizeActionFromText(name, `${name} ${newActFile?.name || ""}`),
                source: newActMode,
                description: newActFile?.name || "本地导入动作",
            };
        }
        onAddCustomAction(created);
        setPickedActionId(created.id);
        setPoseLibTab("mine");
        setNewActOpen(false);
        setNewActName("");
        setNewActDesc("");
        setNewActFile(null);
    };

    return (
        <>
            <aside
                className="flex h-full w-[304px] shrink-0 flex-col border-l text-xs"
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, borderColor: softBorder, color: theme.node.text }}
                onClick={() => contextMenu && setContextMenu(null)}
            >
                {/* 上半区：对象大纲树 */}
                <div className="flex h-[40%] min-h-[200px] flex-col border-b" style={{ borderColor: softBorder }}>
                    <div className="flex items-center justify-between px-3 py-2">
                        <span className="font-semibold">对象</span>
                        <button
                            type="button"
                            title="收起对象与属性面板"
                            className="grid size-6 place-items-center rounded-lg opacity-65 hover:bg-white/10 hover:opacity-100"
                            onClick={onCollapse}
                        >
                            <PanelRightClose className="size-3.5" />
                        </button>
                    </div>
                    <div className="px-3 pb-2">
                        <div
                            className="flex h-7 items-center gap-1.5 rounded-lg border px-2"
                            style={{ borderColor: softBorder, background: theme.glass.inset }}
                        >
                            <Search className="size-3 opacity-55" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="搜索对象"
                                className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:opacity-55"
                            />
                        </div>
                    </div>

                    <div
                        data-node-scroll
                        className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) onSelect(null);
                        }}
                    >
                        {/* 机位组 */}
                        <div>
                            <div className="mb-1 flex items-center justify-between px-1.5 text-[11px] font-semibold" style={{ color: theme.node.muted }}>
                                <span className="flex items-center gap-1">
                                    <Camera className="size-3" />
                                    机位
                                </span>
                                <span className="font-mono text-[10px]">{filteredCams.length}</span>
                            </div>
                            <div className="space-y-0.5">
                                {filteredCams.map((cam) => {
                                    const active = selected?.kind === "camera" && selected.id === cam.id;
                                    const targetActive = selected?.kind === "target" && selected.id === cam.id;
                                    const expanded = expandedCams[cam.id] ?? true;
                                    const isPip = state.pipCameraId === cam.id;
                                    return (
                                        <div key={cam.id}>
                                            <div
                                                className="group flex items-center gap-1 rounded-lg px-1.5 py-1 transition"
                                                style={{ background: active ? theme.accent.soft : "transparent" }}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setContextMenu({ x: e.clientX, y: e.clientY, kind: "camera", id: cam.id });
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="opacity-60 hover:opacity-100"
                                                    onClick={() => setExpandedCams((m) => ({ ...m, [cam.id]: !expanded }))}
                                                >
                                                    {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                                    onClick={() => onSelect({ kind: "camera", id: cam.id })}
                                                >
                                                    <Camera className="size-3 shrink-0" style={{ color: active ? theme.accent.base : theme.node.muted }} />
                                                    <span className="truncate font-medium">{cam.name}</span>
                                                </button>
                                                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                                                    <button
                                                        type="button"
                                                        title="聚焦选中对象"
                                                        className="grid size-5 place-items-center rounded hover:bg-white/10"
                                                        onClick={() => onFocusPosition(cam.position)}
                                                    >
                                                        <Focus className="size-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title={cam.locked ? "解锁对象" : "锁定对象"}
                                                        className="grid size-5 place-items-center rounded hover:bg-white/10"
                                                        onClick={() => onUpdateCamera(cam.id, { locked: !cam.locked })}
                                                    >
                                                        {cam.locked ? <Lock className="size-3 text-amber-400" /> : <Unlock className="size-3" />}
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    title="设为实时预览机位"
                                                    className="grid size-5 place-items-center rounded hover:bg-white/10"
                                                    style={{ color: isPip ? theme.accent.base : theme.node.muted }}
                                                    onClick={() => onSetPipCamera(cam.id)}
                                                >
                                                    <Aperture className="size-3" />
                                                </button>
                                            </div>
                                            {expanded && (
                                                <button
                                                    type="button"
                                                    className="ml-5 flex w-[calc(100%-20px)] items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] transition"
                                                    style={{
                                                        background: targetActive ? theme.accent.soft : "transparent",
                                                        color: targetActive ? theme.accent.base : theme.node.muted,
                                                    }}
                                                    onClick={() => onSelect({ kind: "target", id: cam.id })}
                                                >
                                                    <Crosshair className="size-3" />
                                                    <span>注视点</span>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 角色组 */}
                        <div>
                            <div className="mb-1 flex items-center justify-between px-1.5 text-[11px] font-semibold" style={{ color: theme.node.muted }}>
                                <span className="flex items-center gap-1">
                                    <User className="size-3" />
                                    角色
                                </span>
                                <span className="font-mono text-[10px]">{filteredChars.length}</span>
                            </div>
                            <div className="space-y-0.5">
                                {filteredChars.map((ch) => {
                                    const active = selected?.kind === "character" && selected.id === ch.id;
                                    return (
                                        <div
                                            key={ch.id}
                                            className="group flex items-center gap-1.5 rounded-lg px-2 py-1 transition"
                                            style={{ background: active ? theme.accent.soft : "transparent" }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                setContextMenu({ x: e.clientX, y: e.clientY, kind: "character", id: ch.id });
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                                onClick={() => onSelect({ kind: "character", id: ch.id })}
                                            >
                                                <span className="size-2.5 shrink-0 rounded-full" style={{ background: ch.color }} />
                                                <span className="truncate font-medium">{ch.name}</span>
                                            </button>
                                            <button
                                                type="button"
                                                title="聚焦选中对象"
                                                className="grid size-5 place-items-center rounded opacity-0 hover:bg-white/10 group-hover:opacity-100"
                                                onClick={() => onFocusPosition(ch.position)}
                                            >
                                                <Focus className="size-3" />
                                            </button>
                                            <button
                                                type="button"
                                                title={ch.locked ? "解锁" : "锁定"}
                                                className="grid size-5 place-items-center rounded opacity-0 hover:bg-white/10 group-hover:opacity-100"
                                                onClick={() => onUpdateCharacter(ch.id, { locked: !ch.locked })}
                                            >
                                                {ch.locked ? <Lock className="size-3 text-amber-400" /> : <Unlock className="size-3" />}
                                            </button>
                                            <button
                                                type="button"
                                                title={ch.visible === false ? "显示对象" : "隐藏对象"}
                                                className="grid size-5 place-items-center rounded hover:bg-white/10"
                                                style={{ opacity: ch.visible === false ? 1 : 0.6 }}
                                                onClick={() => onUpdateCharacter(ch.id, { visible: ch.visible === false ? true : false })}
                                            >
                                                {ch.visible === false ? <EyeOff className="size-3 text-amber-400" /> : <Eye className="size-3" />}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 物体组 */}
                        {filteredProps.length > 0 && (
                            <div>
                                <div className="mb-1 flex items-center justify-between px-1.5 text-[11px] font-semibold" style={{ color: theme.node.muted }}>
                                    <span className="flex items-center gap-1">
                                        <Box className="size-3" />
                                        物体
                                    </span>
                                    <span className="font-mono text-[10px]">{filteredProps.length}</span>
                                </div>
                                <div className="space-y-0.5">
                                    {filteredProps.map((pr) => {
                                        const active = selected?.kind === "prop" && selected.id === pr.id;
                                        return (
                                            <div
                                                key={pr.id}
                                                className="group flex items-center gap-1.5 rounded-lg px-2 py-1 transition"
                                                style={{ background: active ? theme.accent.soft : "transparent" }}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setContextMenu({ x: e.clientX, y: e.clientY, kind: "prop", id: pr.id });
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                                    onClick={() => onSelect({ kind: "prop", id: pr.id })}
                                                >
                                                    <span className="size-2.5 shrink-0 rounded-xs" style={{ background: pr.color }} />
                                                    <span className="truncate font-medium">{pr.name}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    title="聚焦选中对象"
                                                    className="grid size-5 place-items-center rounded opacity-0 hover:bg-white/10 group-hover:opacity-100"
                                                    onClick={() => onFocusPosition(pr.position)}
                                                >
                                                    <Focus className="size-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title={pr.visible === false ? "显示" : "隐藏"}
                                                    className="grid size-5 place-items-center rounded hover:bg-white/10"
                                                    onClick={() => onUpdateProp(pr.id, { visible: pr.visible === false ? true : false })}
                                                >
                                                    {pr.visible === false ? <EyeOff className="size-3 text-amber-400" /> : <Eye className="size-3 opacity-60" />}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 下半区：动态属性检查器 */}
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: softBorder }}>
                        <span className="flex items-center gap-1.5 font-semibold">
                            <Sliders className="size-3.5" style={{ color: theme.accent.base }} />
                            属性
                        </span>
                        {selected && (
                            <button
                                type="button"
                                className="text-[11px] hover:underline"
                                style={{ color: theme.node.muted }}
                                onClick={() => onSelect(null)}
                            >
                                环境与灯光
                            </button>
                        )}
                    </div>

                    <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                        {/* 1. 未选中 -> 环境与三点布光面板 */}
                        {!selected && (
                            <>
                                <div className="space-y-1">
                                    <div className="text-[11px]" style={{ color: theme.node.muted }}>环境预设</div>
                                    <select
                                        value={env.preset}
                                        onChange={(e) => {
                                            const p = e.target.value as DirectorEnvironment["preset"];
                                            onUpdateEnvironment(structuredClone(DIRECTOR_ENVIRONMENT_PRESETS[p].env));
                                        }}
                                        className="h-8 w-full rounded-xl border px-2.5 text-xs outline-none"
                                        style={{ borderColor: softBorder, background: theme.glass.inset, color: theme.node.text }}
                                    >
                                        {(Object.entries(DIRECTOR_ENVIRONMENT_PRESETS) as Array<[DirectorEnvironment["preset"], { label: string }]>).map(([k, v]) => (
                                            <option key={k} value={k} style={{ background: theme.node.panel }}>
                                                {v.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <label className="space-y-1">
                                        <span className="text-[11px]" style={{ color: theme.node.muted }}>背景颜色</span>
                                        <div className="flex h-7 items-center gap-1.5 rounded-lg border px-1.5" style={{ borderColor: softBorder, background: theme.glass.inset }}>
                                            <input type="color" value={env.backgroundColor} onChange={(e) => onUpdateEnvironment({ backgroundColor: e.target.value })} className="size-4 cursor-pointer border-0 bg-transparent" />
                                            <span className="font-mono text-[10px] uppercase">{env.backgroundColor}</span>
                                        </div>
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-[11px]" style={{ color: theme.node.muted }}>地面颜色</span>
                                        <div className="flex h-7 items-center gap-1.5 rounded-lg border px-1.5" style={{ borderColor: softBorder, background: theme.glass.inset }}>
                                            <input type="color" value={env.groundColor} onChange={(e) => onUpdateEnvironment({ groundColor: e.target.value })} className="size-4 cursor-pointer border-0 bg-transparent" />
                                            <span className="font-mono text-[10px] uppercase">{env.groundColor}</span>
                                        </div>
                                    </label>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span>显示地面</span>
                                    <ToggleSwitch checked={env.showGround} onChange={(v) => onUpdateEnvironment({ showGround: v })} accent={theme.accent.base} />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px]" style={{ color: theme.node.muted }}>
                                        <span>地面不透明度</span>
                                        <span className="font-mono">{env.groundOpacity}%</span>
                                    </div>
                                    <input type="range" min={0} max={100} value={env.groundOpacity} onChange={(e) => onUpdateEnvironment({ groundOpacity: Number(e.target.value) })} className="w-full accent-[#0ea977]" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px]" style={{ color: theme.node.muted }}>
                                        <span>曝光</span>
                                        <span className="font-mono">{env.exposure.toFixed(2)}</span>
                                    </div>
                                    <input type="range" min={0.4} max={2.2} step={0.05} value={env.exposure} onChange={(e) => onUpdateEnvironment({ exposure: Number(e.target.value) })} className="w-full accent-[#0ea977]" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>显示网格</span>
                                    <ToggleSwitch checked={env.showGrid} onChange={(v) => onUpdateEnvironment({ showGrid: v })} accent={theme.accent.base} />
                                </div>

                                {/* 三点布光：主光 / 补光 / 轮廓光 */}
                                <div className="space-y-2 border-t pt-2.5" style={{ borderColor: softBorder }}>
                                    <div className="font-semibold">主光</div>
                                    <div className="flex items-center justify-between">
                                        <span style={{ color: theme.node.muted }}>灯光颜色</span>
                                        <input type="color" value={env.keyLight.color} onChange={(e) => onUpdateEnvironment({ keyLight: { ...env.keyLight, color: e.target.value } })} className="h-6 w-12 cursor-pointer rounded border-0 bg-transparent" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="flex justify-between text-[11px]" style={{ color: theme.node.muted }}>
                                            <span>强度</span>
                                            <span className="font-mono">{env.keyLight.intensity.toFixed(1)}</span>
                                        </div>
                                        <input type="range" min={0} max={6} step={0.1} value={env.keyLight.intensity} onChange={(e) => onUpdateEnvironment({ keyLight: { ...env.keyLight, intensity: Number(e.target.value) } })} className="w-full accent-[#0ea977]" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-0.5">
                                            <div className="flex justify-between text-[10px]" style={{ color: theme.node.muted }}>
                                                <span>水平角度</span>
                                                <span className="font-mono">{env.keyLight.azimuth}°</span>
                                            </div>
                                            <input type="range" min={-180} max={180} value={env.keyLight.azimuth} onChange={(e) => onUpdateEnvironment({ keyLight: { ...env.keyLight, azimuth: Number(e.target.value) } })} className="w-full accent-[#0ea977]" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="flex justify-between text-[10px]" style={{ color: theme.node.muted }}>
                                                <span>仰角</span>
                                                <span className="font-mono">{env.keyLight.elevation}°</span>
                                            </div>
                                            <input type="range" min={5} max={88} value={env.keyLight.elevation} onChange={(e) => onUpdateEnvironment({ keyLight: { ...env.keyLight, elevation: Number(e.target.value) } })} className="w-full accent-[#0ea977]" />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>阴影</span>
                                        <ToggleSwitch checked={env.keyLight.castShadow} onChange={(v) => onUpdateEnvironment({ keyLight: { ...env.keyLight, castShadow: v } })} accent={theme.accent.base} />
                                    </div>
                                </div>

                                <div className="space-y-2 border-t pt-2.5" style={{ borderColor: softBorder }}>
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">补光</span>
                                        <input type="color" value={env.fillLight.color} onChange={(e) => onUpdateEnvironment({ fillLight: { ...env.fillLight, color: e.target.value } })} className="h-5 w-10 cursor-pointer border-0 bg-transparent" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="range" min={0} max={5} step={0.1} value={env.fillLight.intensity} onChange={(e) => onUpdateEnvironment({ fillLight: { ...env.fillLight, intensity: Number(e.target.value) } })} className="flex-1 accent-[#0ea977]" />
                                        <span className="w-7 text-right font-mono text-[11px]">{env.fillLight.intensity.toFixed(1)}</span>
                                    </div>
                                </div>

                                <div className="space-y-2 border-t pt-2.5" style={{ borderColor: softBorder }}>
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">轮廓光</span>
                                        <input type="color" value={env.rimLight.color} onChange={(e) => onUpdateEnvironment({ rimLight: { ...env.rimLight, color: e.target.value } })} className="h-5 w-10 cursor-pointer border-0 bg-transparent" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="range" min={0} max={5} step={0.1} value={env.rimLight.intensity} onChange={(e) => onUpdateEnvironment({ rimLight: { ...env.rimLight, intensity: Number(e.target.value) } })} className="flex-1 accent-[#0ea977]" />
                                        <span className="w-7 text-right font-mono text-[11px]">{env.rimLight.intensity.toFixed(1)}</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* 2. 选中角色 -> 「对象 / 姿势」双 Tab */}
                        {selectedChar && (
                            <>
                                <div className="grid grid-cols-2 gap-1 rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                                    {(
                                        [
                                            ["object", "对象"],
                                            ["pose", "姿势"],
                                        ] as const
                                    ).map(([k, lbl]) => (
                                        <button
                                            key={k}
                                            type="button"
                                            className="rounded-lg py-1.5 text-[11px] font-semibold transition"
                                            style={charSubTab === k ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                            onClick={() => {
                                                setCharSubTab(k);
                                                if (k === "object" && poseEditMode) onTogglePoseEditMode(false);
                                            }}
                                        >
                                            {lbl}
                                        </button>
                                    ))}
                                </div>

                                {charSubTab === "object" ? (
                                    <div className="space-y-3">
                                        <input
                                            value={selectedChar.name}
                                            onChange={(e) => onUpdateCharacter(selectedChar.id, { name: e.target.value })}
                                            className="h-8 w-full rounded-xl border px-2.5 font-semibold outline-none"
                                            style={{ borderColor: softBorder, background: theme.glass.inset }}
                                        />
                                        <Vec3Row
                                            theme={theme}
                                            label="位置"
                                            unit="m"
                                            value={selectedChar.position}
                                            onChange={(position) => onUpdateCharacter(selectedChar.id, { position })}
                                            showKeyframe={isDynamic}
                                            hasKeyframe={hasKf(selectedChar.id, "position")}
                                            onToggleKeyframe={() => onToggleKeyframe(selectedChar.id, "position", selectedChar.position)}
                                        />
                                        <Vec3Row
                                            theme={theme}
                                            label="旋转"
                                            unit="°"
                                            step={5}
                                            value={selectedChar.rotation}
                                            onChange={(rotation) => onUpdateCharacter(selectedChar.id, { rotation })}
                                            showKeyframe={isDynamic}
                                            hasKeyframe={hasKf(selectedChar.id, "rotation")}
                                            onToggleKeyframe={() => onToggleKeyframe(selectedChar.id, "rotation", selectedChar.rotation)}
                                        />
                                        <Vec3Row
                                            theme={theme}
                                            label="缩放"
                                            unit=""
                                            step={0.05}
                                            value={toScale3(selectedChar.scale)}
                                            onChange={(scale) => onUpdateCharacter(selectedChar.id, { scale })}
                                            showKeyframe={isDynamic}
                                            hasKeyframe={hasKf(selectedChar.id, "scale")}
                                            onToggleKeyframe={() => onToggleKeyframe(selectedChar.id, "scale", toScale3(selectedChar.scale))}
                                        />
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px]" style={{ color: theme.node.muted }}>颜色</span>
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="color"
                                                    value={selectedChar.color}
                                                    onChange={(e) => onUpdateCharacter(selectedChar.id, { color: e.target.value })}
                                                    className="size-6 cursor-pointer rounded border-0 bg-transparent"
                                                />
                                                <input
                                                    value={selectedChar.color}
                                                    onChange={(e) => onUpdateCharacter(selectedChar.id, { color: e.target.value })}
                                                    className="h-7 w-20 rounded-lg border px-1.5 font-mono text-[11px] uppercase outline-none"
                                                    style={{ borderColor: softBorder, background: theme.glass.inset }}
                                                />
                                                <button
                                                    type="button"
                                                    title="恢复原色"
                                                    className="grid size-7 place-items-center rounded-lg border hover:border-[#37d39b]"
                                                    style={{ borderColor: softBorder }}
                                                    onClick={() => onUpdateCharacter(selectedChar.id, { color: selectedChar.defaultColor || "#a07d8b" })}
                                                >
                                                    <RotateCcw className="size-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-[11px]" style={{ color: theme.node.muted }}>
                                                <span>不透明度</span>
                                                <span className="font-mono">{selectedChar.opacity ?? 100}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={10}
                                                max={100}
                                                value={selectedChar.opacity ?? 100}
                                                onChange={(e) => onUpdateCharacter(selectedChar.id, { opacity: Number(e.target.value) })}
                                                className="w-full accent-[#0ea977]"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between rounded-xl px-2.5 py-2" style={{ background: theme.glass.inset }}>
                                            <span className="truncate font-medium">
                                                {selectedChar.name} · <span style={{ color: theme.accent.base }}>{selectedChar.pose}</span>
                                            </span>
                                            <button
                                                type="button"
                                                title="重置姿势"
                                                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] hover:bg-white/10"
                                                onClick={() => onUpdateCharacter(selectedChar.id, { pose: "自然站立", joints: emptyJoints() })}
                                            >
                                                <RotateCcw className="size-3" />
                                                重置姿势
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <button
                                                type="button"
                                                className="h-8 rounded-xl font-semibold text-white transition hover:brightness-110"
                                                style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                                onClick={() => setPoseLibOpen(true)}
                                            >
                                                预设姿势
                                            </button>
                                            <button
                                                type="button"
                                                className="h-8 rounded-xl border font-semibold transition"
                                                style={{
                                                    borderColor: poseEditMode ? theme.accent.base : softBorder,
                                                    background: poseEditMode ? theme.accent.soft : theme.glass.inset,
                                                    color: poseEditMode ? theme.accent.base : theme.node.text,
                                                }}
                                                onClick={() => {
                                                    const next = !poseEditMode;
                                                    onTogglePoseEditMode(next);
                                                    if (next) onFocusPosition(selectedChar.position);
                                                }}
                                            >
                                                {poseEditMode ? "退出 3D 骨骼" : "编辑姿势"}
                                            </button>
                                        </div>

                                        {/* 7 大折叠骨骼关节滑块组（完整 25 自由度） */}
                                        <div className="space-y-1.5">
                                            {DIRECTOR_JOINT_GROUPS.map((group) => {
                                                const isOpen = openJointGroups[group.id] || activeJointGroup === group.id;
                                                const joints = normalizeJoints(selectedChar.joints);
                                                return (
                                                    <div
                                                        key={group.id}
                                                        className="overflow-hidden rounded-xl border"
                                                        style={{
                                                            borderColor: activeJointGroup === group.id && poseEditMode ? theme.accent.base : softBorder,
                                                            background: theme.glass.inset,
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] font-semibold"
                                                            onClick={() => {
                                                                setOpenJointGroups((m) => ({ ...m, [group.id]: !isOpen }));
                                                                onSelectJointGroup(group.id);
                                                            }}
                                                        >
                                                            <span>{group.label}</span>
                                                            {isOpen ? <ChevronDown className="size-3.5 opacity-60" /> : <ChevronRight className="size-3.5 opacity-60" />}
                                                        </button>
                                                        {isOpen && (
                                                            <div className="space-y-2 border-t px-2.5 py-2" style={{ borderColor: softBorder }}>
                                                                {group.sliders.map((s) => {
                                                                    const val = Number(joints[s.key] ?? 0);
                                                                    return (
                                                                        <div key={s.key} className="space-y-0.5">
                                                                            <div className="flex justify-between text-[10px]" style={{ color: theme.node.muted }}>
                                                                                <span>{s.label}</span>
                                                                                <span className="font-mono">{val}°</span>
                                                                            </div>
                                                                            <input
                                                                                type="range"
                                                                                min={s.min}
                                                                                max={s.max}
                                                                                value={val}
                                                                                onChange={(e) => {
                                                                                    const nextJoints: PoseJoints25 = { ...joints, [s.key]: Number(e.target.value) };
                                                                                    onUpdateCharacter(selectedChar.id, { pose: "自定义", joints: nextJoints });
                                                                                }}
                                                                                className="w-full accent-[#0ea977]"
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* 3. 选中机位或注视点 */}
                        {selectedCam && (
                            <div className="space-y-3">
                                <input
                                    value={selectedCam.name}
                                    onChange={(e) => onUpdateCamera(selectedCam.id, { name: e.target.value })}
                                    className="h-8 w-full rounded-xl border px-2.5 font-semibold outline-none"
                                    style={{ borderColor: softBorder, background: theme.glass.inset }}
                                />
                                <Vec3Row
                                    theme={theme}
                                    label="机位位置"
                                    unit="m"
                                    value={selectedCam.position}
                                    onChange={(position) => onUpdateCamera(selectedCam.id, { position })}
                                    showKeyframe={isDynamic}
                                    hasKeyframe={hasKf(selectedCam.id, "position")}
                                    onToggleKeyframe={() => onToggleKeyframe(selectedCam.id, "position", selectedCam.position)}
                                />
                                <Vec3Row
                                    theme={theme}
                                    label="注视点"
                                    unit="m"
                                    value={selectedCam.target}
                                    onChange={(target) => onUpdateCamera(selectedCam.id, { target })}
                                    showKeyframe={isDynamic}
                                    hasKeyframe={hasKf(selectedCam.id, "target")}
                                    onToggleKeyframe={() => onToggleKeyframe(selectedCam.id, "target", selectedCam.target)}
                                />
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px]" style={{ color: theme.node.muted }}>
                                        <span>视野（FOV）</span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-mono">{selectedCam.fov}°</span>
                                            {isDynamic && (
                                                <button
                                                    type="button"
                                                    style={{ color: hasKf(selectedCam.id, "fov") ? theme.accent.base : theme.node.muted }}
                                                    onClick={() => onToggleKeyframe(selectedCam.id, "fov", selectedCam.fov)}
                                                >
                                                    <Diamond className="size-3" fill={hasKf(selectedCam.id, "fov") ? "currentColor" : "none"} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min={18}
                                        max={100}
                                        value={selectedCam.fov}
                                        onChange={(e) => onUpdateCamera(selectedCam.id, { fov: Number(e.target.value) })}
                                        className="w-full accent-[#0ea977]"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px]" style={{ color: theme.node.muted }}>
                                        <span>画面倾斜（Roll）</span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-mono">{selectedCam.roll || 0}°</span>
                                            {isDynamic && (
                                                <button
                                                    type="button"
                                                    style={{ color: hasKf(selectedCam.id, "roll") ? theme.accent.base : theme.node.muted }}
                                                    onClick={() => onToggleKeyframe(selectedCam.id, "roll", selectedCam.roll || 0)}
                                                >
                                                    <Diamond className="size-3" fill={hasKf(selectedCam.id, "roll") ? "currentColor" : "none"} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min={-45}
                                        max={45}
                                        value={selectedCam.roll || 0}
                                        onChange={(e) => onUpdateCamera(selectedCam.id, { roll: Number(e.target.value) })}
                                        className="w-full accent-[#0ea977]"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[11px]" style={{ color: theme.node.muted }}>画幅比例</span>
                                    <select
                                        value={selectedCam.aspectRatio || state.aspectRatio}
                                        onChange={(e) => onUpdateCamera(selectedCam.id, { aspectRatio: e.target.value })}
                                        className="h-8 w-full rounded-xl border px-2.5 font-mono text-xs outline-none"
                                        style={{ borderColor: softBorder, background: theme.glass.inset, color: theme.node.text }}
                                    >
                                        {DIRECTOR_ASPECT_RATIOS.map((r) => (
                                            <option key={r.value} value={r.value} style={{ background: theme.node.panel }}>
                                                {r.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2 border-t pt-2" style={{ borderColor: softBorder }}>
                                    <div className="flex items-center justify-between">
                                        <span>显示注视点</span>
                                        <ToggleSwitch
                                            checked={selectedCam.showTarget !== false}
                                            onChange={(v) => onUpdateCamera(selectedCam.id, { showTarget: v })}
                                            accent={theme.accent.base}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>锁定注视点</span>
                                        <ToggleSwitch
                                            checked={Boolean(selectedCam.lockTarget)}
                                            onChange={(v) => onUpdateCamera(selectedCam.id, { lockTarget: v })}
                                            accent={theme.accent.base}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 4. 选中物体 */}
                        {selectedProp && (
                            <div className="space-y-3">
                                <input
                                    value={selectedProp.name}
                                    onChange={(e) => onUpdateProp(selectedProp.id, { name: e.target.value })}
                                    className="h-8 w-full rounded-xl border px-2.5 font-semibold outline-none"
                                    style={{ borderColor: softBorder, background: theme.glass.inset }}
                                />
                                <div className="space-y-1.5 rounded-xl p-2" style={{ background: theme.glass.inset }}>
                                    <div className="text-[11px] font-semibold">模型尺寸（宽 / 高 / 深 m）</div>
                                    <div className="text-[10px]" style={{ color: theme.node.muted }}>
                                        调整模型本身的尺寸，不支持关键帧。需要尺寸动画时，请使用“缩放”。
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {(["W", "H", "D"] as const).map((lbl, idx) => (
                                            <label key={lbl} className="flex h-7 items-center gap-1 rounded-lg border px-1.5" style={{ borderColor: softBorder, background: theme.node.panel }}>
                                                <span className="text-[10px] opacity-60">{lbl}</span>
                                                <input
                                                    type="number"
                                                    step={0.1}
                                                    min={0.05}
                                                    value={selectedProp.dimensions[idx]}
                                                    onChange={(e) => {
                                                        const dims: [number, number, number] = [...selectedProp.dimensions];
                                                        dims[idx] = Math.max(0.05, Number(e.target.value) || 0.1);
                                                        onUpdateProp(selectedProp.id, { dimensions: dims });
                                                    }}
                                                    className="w-full min-w-0 bg-transparent font-mono text-[11px] outline-none"
                                                />
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <Vec3Row
                                    theme={theme}
                                    label="位置"
                                    unit="m"
                                    value={selectedProp.position}
                                    onChange={(position) => onUpdateProp(selectedProp.id, { position })}
                                    showKeyframe={isDynamic}
                                    hasKeyframe={hasKf(selectedProp.id, "position")}
                                    onToggleKeyframe={() => onToggleKeyframe(selectedProp.id, "position", selectedProp.position)}
                                />
                                <Vec3Row
                                    theme={theme}
                                    label="旋转"
                                    unit="°"
                                    step={5}
                                    value={selectedProp.rotation}
                                    onChange={(rotation) => onUpdateProp(selectedProp.id, { rotation })}
                                    showKeyframe={isDynamic}
                                    hasKeyframe={hasKf(selectedProp.id, "rotation")}
                                    onToggleKeyframe={() => onToggleKeyframe(selectedProp.id, "rotation", selectedProp.rotation)}
                                />
                                <Vec3Row
                                    theme={theme}
                                    label="缩放"
                                    unit=""
                                    step={0.05}
                                    value={selectedProp.scale}
                                    onChange={(scale) => onUpdateProp(selectedProp.id, { scale })}
                                    showKeyframe={isDynamic}
                                    hasKeyframe={hasKf(selectedProp.id, "scale")}
                                    onToggleKeyframe={() => onToggleKeyframe(selectedProp.id, "scale", selectedProp.scale)}
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px]" style={{ color: theme.node.muted }}>颜色</span>
                                    <div className="flex items-center gap-1.5">
                                        <input type="color" value={selectedProp.color} onChange={(e) => onUpdateProp(selectedProp.id, { color: e.target.value })} className="size-6 cursor-pointer border-0 bg-transparent" />
                                        <input value={selectedProp.color} onChange={(e) => onUpdateProp(selectedProp.id, { color: e.target.value })} className="h-7 w-20 rounded-lg border px-1.5 font-mono text-[11px] uppercase outline-none" style={{ borderColor: softBorder, background: theme.glass.inset }} />
                                        <button type="button" title="恢复原色" className="grid size-7 place-items-center rounded-lg border" style={{ borderColor: softBorder }} onClick={() => onUpdateProp(selectedProp.id, { color: selectedProp.defaultColor || "#8d96a5" })}>
                                            <RotateCcw className="size-3" />
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px]" style={{ color: theme.node.muted }}>
                                        <span>不透明度</span>
                                        <span className="font-mono">{selectedProp.opacity}%</span>
                                    </div>
                                    <input type="range" min={10} max={100} value={selectedProp.opacity} onChange={(e) => onUpdateProp(selectedProp.id, { opacity: Number(e.target.value) })} className="w-full accent-[#0ea977]" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* 对象大纲右键菜单：复制 / 删除 */}
            {contextMenu && (
                <div
                    className="fixed z-[170] w-32 rounded-xl border p-1 text-xs shadow-2xl"
                    style={{
                        left: contextMenu.x,
                        top: contextMenu.y,
                        ...canvasGlass(theme),
                        backgroundColor: theme.toolbar.panel,
                        color: theme.node.text,
                    }}
                >
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[#0ea977]/15"
                        onClick={() => {
                            onDuplicateEntity(contextMenu.kind, contextMenu.id);
                            setContextMenu(null);
                        }}
                    >
                        <Copy className="size-3.5" />
                        复制
                    </button>
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-red-400 hover:bg-red-500/15"
                        onClick={() => {
                            onDeleteEntity(contextMenu.kind, contextMenu.id);
                            setContextMenu(null);
                        }}
                    >
                        <Trash2 className="size-3.5" />
                        删除
                    </button>
                </div>
            )}

            {/* 预设姿势 / 动作素材库弹窗 */}
            {poseLibOpen && selectedChar && (
                <div
                    className="fixed inset-0 z-[160] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) setPoseLibOpen(false);
                    }}
                >
                    <div
                        className="flex h-[min(78dvh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                    >
                        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: softBorder }}>
                            <div>
                                <div className="text-sm font-semibold">预设姿势与动作素材库</div>
                                <div className="text-[11px]" style={{ color: theme.node.muted }}>
                                    选择一个动作，再通过下方帧滑块截取任意一帧作为静态姿势
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="inline-flex h-7 items-center gap-1 rounded-xl px-3 font-semibold text-white"
                                    style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                    onClick={() => setNewActOpen(true)}
                                >
                                    <Plus className="size-3.5" />
                                    新建动作
                                </button>
                                <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={() => setPoseLibOpen(false)}>
                                    <X className="size-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2" style={{ borderColor: softBorder }}>
                            <div className="inline-flex rounded-lg p-0.5" style={{ background: theme.glass.inset }}>
                                <button
                                    type="button"
                                    className="rounded-md px-2.5 py-1 font-semibold"
                                    style={poseLibTab === "preset" ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                    onClick={() => setPoseLibTab("preset")}
                                >
                                    预设 · {DIRECTOR_ACTION_PRESETS.length}
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md px-2.5 py-1 font-semibold"
                                    style={poseLibTab === "mine" ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                    onClick={() => setPoseLibTab("mine")}
                                >
                                    我的 · {(state.customActions || []).length}
                                </button>
                            </div>
                            <div className="flex h-7 flex-1 items-center gap-1.5 rounded-lg border px-2" style={{ borderColor: softBorder, background: theme.glass.inset }}>
                                <Search className="size-3 opacity-55" />
                                <input
                                    value={poseSearch}
                                    onChange={(e) => setPoseSearch(e.target.value)}
                                    placeholder="搜索动作名称…"
                                    className="min-w-0 flex-1 bg-transparent outline-none"
                                />
                            </div>
                        </div>

                        {poseLibTab === "preset" && (
                            <div className="flex flex-wrap gap-1 px-4 pt-2.5">
                                {["全部", "站姿与待机", "坐卧与倚靠", "行走与奔跑", "交谈与社交", "情绪与表演", "动作与格斗", "日常与工作"].map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        className="rounded-full px-2.5 py-0.5 text-[11px]"
                                        style={poseCat === c ? { background: theme.accent.soft, color: theme.accent.base, fontWeight: 600 } : { background: theme.glass.inset, color: theme.node.muted }}
                                        onClick={() => setPoseCat(c)}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                            <div className="grid grid-cols-3 gap-2">
                                {(poseLibTab === "preset" ? filteredPresetActions : filteredCustomActions).map((act) => {
                                    const active = pickedActionId === act.id;
                                    return (
                                        <button
                                            key={act.id}
                                            type="button"
                                            className="rounded-xl border px-3 py-2.5 text-left transition hover:border-[#37d39b]"
                                            style={{
                                                borderColor: active ? theme.accent.base : softBorder,
                                                background: active ? theme.accent.soft : theme.node.panel,
                                            }}
                                            onClick={() => {
                                                setPickedActionId(act.id);
                                                applyPickedPoseFrame(act.id, pickedFrame);
                                            }}
                                        >
                                            <div className="truncate font-semibold">{act.name}</div>
                                            <div className="mt-0.5 text-[10px]" style={{ color: theme.node.muted }}>
                                                {"category" in act ? act.category : act.source === "text" ? "文字生成" : act.source === "video" ? "视频转动作" : "FBX 动作"} · {act.durationSec}s
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 底部帧选择器 */}
                        <div className="flex items-center gap-3 border-t px-4 py-3" style={{ borderColor: softBorder, background: theme.glass.inset }}>
                            <span className="shrink-0 font-medium">选取静帧：</span>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(pickedFrame * 100)}
                                onChange={(e) => {
                                    const f = Number(e.target.value) / 100;
                                    setPickedFrame(f);
                                    applyPickedPoseFrame(pickedActionId, f);
                                }}
                                className="flex-1 accent-[#0ea977]"
                            />
                            <span className="w-10 text-right font-mono">{Math.round(pickedFrame * 100)}%</span>
                            <button
                                type="button"
                                className="h-8 rounded-xl px-4 font-semibold text-white"
                                style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                onClick={() => setPoseLibOpen(false)}
                            >
                                应用姿势
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* + 新建动作（文字生成 / 视频转动作 / 导入 FBX 动作）弹窗 */}
            {newActOpen && (
                <div
                    className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) setNewActOpen(false);
                    }}
                >
                    <div
                        className="w-full max-w-md space-y-4 rounded-2xl border p-5 text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">新建动作</div>
                            <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={() => setNewActOpen(false)}>
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: theme.glass.inset }}>
                            {(
                                [
                                    ["text", "文字生成动作"],
                                    ["video", "视频转动作"],
                                    ["fbx", "导入动作"],
                                ] as const
                            ).map(([k, lbl]) => (
                                <button
                                    key={k}
                                    type="button"
                                    className="rounded-lg py-1.5 text-[11px] font-semibold transition"
                                    style={newActMode === k ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                    onClick={() => setNewActMode(k)}
                                >
                                    {lbl}
                                </button>
                            ))}
                        </div>
                        <label className="block space-y-1">
                            <span className="text-[11px]" style={{ color: theme.node.muted }}>动作名称</span>
                            <input
                                value={newActName}
                                onChange={(e) => setNewActName(e.target.value)}
                                placeholder="例如：挥手致意"
                                className="h-8 w-full rounded-xl border px-2.5 outline-none"
                                style={{ borderColor: softBorder, background: theme.node.panel }}
                            />
                        </label>
                        {newActMode === "text" ? (
                            <label className="block space-y-1">
                                <span className="text-[11px]" style={{ color: theme.node.muted }}>描述动作（上限 2000 字）</span>
                                <textarea
                                    rows={4}
                                    maxLength={2000}
                                    value={newActDesc}
                                    onChange={(e) => setNewActDesc(e.target.value)}
                                    placeholder="例如：抬起右手挥手，再缓缓放下"
                                    className="w-full resize-none rounded-xl border p-2.5 outline-none"
                                    style={{ borderColor: softBorder, background: theme.node.panel }}
                                />
                            </label>
                        ) : (
                            <button
                                type="button"
                                className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed py-5 hover:border-[#37d39b]"
                                style={{ borderColor: theme.node.stroke, background: theme.glass.inset }}
                                onClick={() => newActFileRef.current?.click()}
                            >
                                <Upload className="size-5" style={{ color: theme.accent.base }} />
                                <span className="font-medium">
                                    {newActFile
                                        ? newActFile.name
                                        : newActMode === "video"
                                          ? "选择参考视频（人物清晰，≤1 分钟，≤100 MB）"
                                          : "上传包含动画的 FBX 文件（兼容 65 骨 Mixamo 骨架）"}
                                </span>
                            </button>
                        )}
                        <input
                            ref={newActFileRef}
                            type="file"
                            accept={newActMode === "video" ? "video/*" : ".fbx"}
                            hidden
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) setNewActFile(f);
                            }}
                        />
                        <div className="flex justify-end gap-2">
                            <button type="button" className="h-8 rounded-xl border px-3.5" style={{ borderColor: softBorder }} onClick={() => setNewActOpen(false)}>
                                取消
                            </button>
                            <button
                                type="button"
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl px-4 font-semibold text-white"
                                style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                onClick={handleCreateNewAction}
                            >
                                <Sparkles className="size-3.5" />
                                生成并保存到「我的」
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
