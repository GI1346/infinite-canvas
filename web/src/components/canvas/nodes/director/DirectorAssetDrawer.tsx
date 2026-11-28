import { useMemo, useRef, useState } from "react";
import { Box, Camera, Image as ImageIcon, Plus, Search, Upload, User, X } from "lucide-react";
import { nanoid } from "nanoid";
import { canvasGlass, type CanvasTheme } from "@/lib/canvas-theme";
import {
    DIRECTOR_CAMERA_PRESETS,
    DIRECTOR_CHARACTER_PRESETS,
    DIRECTOR_GEOMETRY_PRESETS,
    DIRECTOR_OBJECT_PRESETS,
    type DirectorCameraPreset,
    type PropCategory,
} from "@/lib/canvas/director/presets";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import type { DirectorBackgroundItem, DirectorCustomAsset, DirectorStageState } from "@/types/canvas";
import type { PlacementTask } from "./DirectorViewport";

type AssetTab = "character" | "prop" | "background" | "camera";

const PROP_CATEGORIES: Array<"全部" | PropCategory> = [
    "全部",
    "家具",
    "建筑",
    "自然",
    "街道",
    "办公",
    "厨房",
    "卫浴",
    "日用",
];

type Props = {
    theme: CanvasTheme;
    open: boolean;
    state: DirectorStageState;
    canvasImages: Array<{ id: string; title: string; url: string }>;
    onClose: () => void;
    onStartPlacement: (task: PlacementTask) => void;
    onSelectCameraPreset: (preset: DirectorCameraPreset) => void;
    onApplyBackground: (kind: "none" | "panorama" | "plane", url?: string) => void;
    onAddBackgroundItem: (item: DirectorBackgroundItem) => void;
    onAddCustomAsset: (asset: DirectorCustomAsset) => void;
};

export function DirectorAssetDrawer({
    theme,
    open,
    state,
    canvasImages,
    onClose,
    onStartPlacement,
    onSelectCameraPreset,
    onApplyBackground,
    onAddBackgroundItem,
    onAddCustomAsset,
}: Props) {
    const [tab, setTab] = useState<AssetTab>("character");
    const [query, setQuery] = useState("");
    const [charSub, setCharSub] = useState<"all" | "mine">("all");
    const [propSub, setPropSub] = useState<"all" | "geometry" | "object" | "mine">("all");
    const [propCat, setPropCat] = useState<"全部" | PropCategory>("全部");
    const [bgSub, setBgSub] = useState<"all" | "panorama" | "plane">("all");

    // 导入角色 / 物体 / 背景弹窗
    const [importKind, setImportKind] = useState<"character" | "prop" | null>(null);
    const [importName, setImportName] = useState("");
    const [importHeight, setImportHeight] = useState(1.75);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);

    const [bgModalOpen, setBgModalOpen] = useState(false);
    const [bgPickKind, setBgPickKind] = useState<"panorama" | "plane">("panorama");
    const bgFileRef = useRef<HTMLInputElement>(null);
    const modelFileRef = useRef<HTMLInputElement>(null);

    const q = query.trim().toLowerCase();
    const myCharacters = useMemo(
        () => (state.customAssets || []).filter((a) => a.kind === "character" && (!q || a.name.toLowerCase().includes(q))),
        [state.customAssets, q],
    );
    const myProps = useMemo(
        () => (state.customAssets || []).filter((a) => a.kind === "prop" && (!q || a.name.toLowerCase().includes(q))),
        [state.customAssets, q],
    );
    const filteredChars = useMemo(
        () => DIRECTOR_CHARACTER_PRESETS.filter((c) => !q || c.label.toLowerCase().includes(q) || c.tag.includes(q)),
        [q],
    );
    const filteredGeos = useMemo(
        () => DIRECTOR_GEOMETRY_PRESETS.filter((g) => !q || g.name.toLowerCase().includes(q)),
        [q],
    );
    const filteredObjs = useMemo(
        () =>
            DIRECTOR_OBJECT_PRESETS.filter(
                (o) =>
                    (propCat === "全部" || o.category === propCat) &&
                    (!q || o.name.toLowerCase().includes(q) || o.category.includes(q)),
            ),
        [q, propCat],
    );
    const filteredCams = useMemo(
        () => DIRECTOR_CAMERA_PRESETS.filter((c) => !q || c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)),
        [q],
    );
    const filteredBgs = useMemo(
        () =>
            (state.backgrounds || []).filter(
                (b) => (bgSub === "all" || b.kind === bgSub) && (!q || b.name.toLowerCase().includes(q)),
            ),
        [state.backgrounds, bgSub, q],
    );

    if (!open) return null;

    const softBorder = theme.glass.insetBorder;

    const handleConfirmModelImport = async () => {
        if (!importFile || !importKind) return;
        setImporting(true);
        try {
            const ext = importFile.name.split(".").pop()?.toLowerCase();
            const format: "glb" | "gltf" | "fbx" = ext === "fbx" ? "fbx" : ext === "gltf" ? "gltf" : "glb";
            const uploaded = await uploadMediaFile(importFile, "director-3d");
            const asset: DirectorCustomAsset = {
                id: nanoid(),
                name: importName.trim() || importFile.name.replace(/\.[^.]+$/, ""),
                kind: importKind,
                format,
                targetHeight: Math.max(0.1, Number(importHeight) || 1.75),
                url: uploaded.url,
                storageKey: uploaded.storageKey,
                createdAt: Date.now(),
            };
            onAddCustomAsset(asset);
            setImportKind(null);
            setImportFile(null);
            setImportName("");
        } finally {
            setImporting(false);
        }
    };

    const handleUploadBg = async (file: File) => {
        const uploaded = await uploadImage(file);
        const item: DirectorBackgroundItem = {
            id: nanoid(),
            name: file.name.replace(/\.[^.]+$/, ""),
            kind: bgPickKind,
            url: uploaded.url,
            storageKey: uploaded.storageKey,
            createdAt: Date.now(),
        };
        onAddBackgroundItem(item);
        onApplyBackground(bgPickKind, uploaded.url);
        setBgModalOpen(false);
    };

    return (
        <>
            <aside
                className="bf-spring-pop z-20 flex h-full w-[288px] shrink-0 flex-col border-r text-xs"
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, borderColor: softBorder, color: theme.node.text }}
            >
                {/* 顶部 4 大分类 Tab */}
                <div className="flex items-center justify-between border-b px-2.5 py-2" style={{ borderColor: softBorder }}>
                    <div className="grid flex-1 grid-cols-4 gap-1 rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                        {(
                            [
                                ["character", "角色", User],
                                ["prop", "物体", Box],
                                ["background", "背景", ImageIcon],
                                ["camera", "机位", Camera],
                            ] as const
                        ).map(([id, label, Icon]) => {
                            const active = tab === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    className="flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition"
                                    style={
                                        active
                                            ? { background: theme.node.panel, color: theme.accent.base, boxShadow: "0 1px 4px rgba(0,0,0,0.16)" }
                                            : { color: theme.node.muted }
                                    }
                                    onClick={() => {
                                        setTab(id);
                                        setQuery("");
                                    }}
                                >
                                    <Icon className="size-3" />
                                    <span>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        aria-label="收起资产抽屉"
                        className="ml-1.5 grid size-7 shrink-0 place-items-center rounded-lg opacity-65 hover:bg-white/10 hover:opacity-100"
                        onClick={onClose}
                    >
                        <X className="size-3.5" />
                    </button>
                </div>

                {/* 搜索框 */}
                <div className="px-3 pt-2.5 pb-2">
                    <div
                        className="flex h-8 items-center gap-2 rounded-xl border px-2.5"
                        style={{ borderColor: softBorder, background: theme.glass.inset }}
                    >
                        <Search className="size-3.5 shrink-0 opacity-55" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="搜索素材"
                            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:opacity-55"
                        />
                        {query && (
                            <button type="button" className="opacity-55 hover:opacity-100" onClick={() => setQuery("")}>
                                <X className="size-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab 内容 */}
                <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                    {tab === "character" && (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="inline-flex rounded-lg p-0.5 text-[11px]" style={{ background: theme.glass.inset }}>
                                    {(
                                        [
                                            ["all", "全部"],
                                            ["mine", `我的 (${myCharacters.length})`],
                                        ] as const
                                    ).map(([k, lbl]) => (
                                        <button
                                            key={k}
                                            type="button"
                                            className="rounded-md px-2.5 py-1 font-medium transition"
                                            style={charSub === k ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                            onClick={() => setCharSub(k)}
                                        >
                                            {lbl}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-white transition hover:brightness-110"
                                    style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                    onClick={() => {
                                        setImportKind("character");
                                        setImportHeight(1.75);
                                        setImportName("");
                                        setImportFile(null);
                                    }}
                                >
                                    <Plus className="size-3" />
                                    添加角色
                                </button>
                            </div>

                            {charSub === "mine" ? (
                                myCharacters.length ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {myCharacters.map((a) => (
                                            <button
                                                key={a.id}
                                                type="button"
                                                className="group flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition hover:border-[#37d39b]"
                                                style={{ borderColor: softBorder, background: theme.node.panel }}
                                                onClick={() => onStartPlacement({ kind: "character", bodyType: "custom", label: a.name, customAssetId: a.id })}
                                            >
                                                <span className="grid size-10 place-items-center rounded-xl" style={{ background: theme.accent.soft, color: theme.accent.base }}>
                                                    <User className="size-5" />
                                                </span>
                                                <span className="w-full truncate font-medium">{a.name}</span>
                                                <span className="font-mono text-[10px]" style={{ color: theme.node.muted }}>
                                                    {a.format.toUpperCase()} · {a.targetHeight}m
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed p-5 text-center text-[11px]" style={{ borderColor: softBorder, color: theme.node.muted }}>
                                        暂未导入自定义角色，点击右上角「+ 添加角色」上传 Mixamo FBX / GLB 模型。
                                    </div>
                                )
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {filteredChars.map((c) => (
                                        <button
                                            key={c.value}
                                            type="button"
                                            className="group flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition hover:border-[#37d39b]"
                                            style={{ borderColor: softBorder, background: theme.node.panel }}
                                            onClick={() => onStartPlacement({ kind: "character", bodyType: c.value, label: c.label })}
                                        >
                                            <span
                                                className="relative grid size-11 place-items-center rounded-xl transition group-hover:scale-105"
                                                style={{ background: `${c.defaultColor}28`, border: `1px solid ${c.defaultColor}66` }}
                                            >
                                                <span className="size-3 rounded-full" style={{ background: c.defaultColor }} />
                                                <span className="absolute right-1 bottom-1 rounded bg-black/45 px-1 font-mono text-[9px] text-white">
                                                    {c.heightM}m
                                                </span>
                                            </span>
                                            <span className="w-full truncate text-[11px] font-medium">{c.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "prop" && (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-1.5">
                                <div className="inline-flex rounded-lg p-0.5 text-[10px]" style={{ background: theme.glass.inset }}>
                                    {(
                                        [
                                            ["all", "全部"],
                                            ["geometry", "几何体"],
                                            ["object", "物体"],
                                            ["mine", "我的"],
                                        ] as const
                                    ).map(([k, lbl]) => (
                                        <button
                                            key={k}
                                            type="button"
                                            className="rounded-md px-2 py-1 font-medium transition"
                                            style={propSub === k ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                            onClick={() => setPropSub(k)}
                                        >
                                            {lbl}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-white transition hover:brightness-110"
                                    style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                    onClick={() => {
                                        setImportKind("prop");
                                        setImportHeight(1.0);
                                        setImportName("");
                                        setImportFile(null);
                                    }}
                                >
                                    <Plus className="size-3" />
                                    添加物体
                                </button>
                            </div>

                            {(propSub === "all" || propSub === "object") && (
                                <div className="flex flex-wrap gap-1">
                                    {PROP_CATEGORIES.map((cat) => (
                                        <button
                                            key={cat}
                                            type="button"
                                            className="rounded-full px-2 py-0.5 text-[10px] font-medium transition"
                                            style={
                                                propCat === cat
                                                    ? { background: theme.accent.soft, color: theme.accent.base }
                                                    : { background: theme.glass.inset, color: theme.node.muted }
                                            }
                                            onClick={() => setPropCat(cat)}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {propSub === "mine" &&
                                (myProps.length ? (
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {myProps.map((a) => (
                                            <button
                                                key={a.id}
                                                type="button"
                                                className="flex flex-col items-start gap-0.5 rounded-xl border p-2 text-left transition hover:border-[#37d39b]"
                                                style={{ borderColor: softBorder, background: theme.node.panel }}
                                                onClick={() => onStartPlacement({ kind: "prop", presetId: "custom", label: a.name, customAssetId: a.id })}
                                            >
                                                <span className="w-full truncate text-[11px] font-medium">{a.name}</span>
                                                <span className="font-mono text-[10px]" style={{ color: theme.node.muted }}>
                                                    {a.format.toUpperCase()} · {a.targetHeight}m
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed p-5 text-center text-[11px]" style={{ borderColor: softBorder, color: theme.node.muted }}>
                                        点击「+ 添加物体」可导入本地 GLB / GLTF / FBX 三维模型并自动贴地缩放。
                                    </div>
                                ))}

                            {(propSub === "all" || propSub === "geometry") && filteredGeos.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="text-[11px] font-semibold" style={{ color: theme.node.muted }}>
                                        几何体 ({filteredGeos.length})
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {filteredGeos.map((g) => (
                                            <button
                                                key={g.id}
                                                type="button"
                                                className="flex items-center justify-between rounded-xl border px-2.5 py-2 text-left transition hover:border-[#37d39b]"
                                                style={{ borderColor: softBorder, background: theme.node.panel }}
                                                onClick={() => onStartPlacement({ kind: "prop", presetId: g.id, label: g.name })}
                                            >
                                                <span className="truncate text-[11px] font-medium">{g.name}</span>
                                                <span className="font-mono text-[10px]" style={{ color: theme.node.muted }}>
                                                    {g.height}m
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(propSub === "all" || propSub === "object") && filteredObjs.length > 0 && (
                                <div className="space-y-1.5 pt-1">
                                    <div className="text-[11px] font-semibold" style={{ color: theme.node.muted }}>
                                        简模物体 ({filteredObjs.length})
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {filteredObjs.map((o) => (
                                            <button
                                                key={o.id}
                                                type="button"
                                                className="flex flex-col gap-0.5 rounded-xl border px-2.5 py-2 text-left transition hover:border-[#37d39b]"
                                                style={{ borderColor: softBorder, background: theme.node.panel }}
                                                onClick={() => onStartPlacement({ kind: "prop", presetId: o.id, label: o.name })}
                                            >
                                                <div className="flex w-full items-center justify-between gap-1">
                                                    <span className="truncate text-[11px] font-medium">{o.name}</span>
                                                    <span className="size-2 shrink-0 rounded-full" style={{ background: o.color }} />
                                                </div>
                                                <span className="text-[10px]" style={{ color: theme.node.muted }}>
                                                    {o.category} · {o.height}m
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "background" && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-1.5">
                                <div className="inline-flex rounded-lg p-0.5 text-[10px]" style={{ background: theme.glass.inset }}>
                                    {(
                                        [
                                            ["all", "全部"],
                                            ["panorama", "全景背景"],
                                            ["plane", "平面背景"],
                                        ] as const
                                    ).map(([k, lbl]) => (
                                        <button
                                            key={k}
                                            type="button"
                                            className="rounded-md px-2 py-1 font-medium transition"
                                            style={bgSub === k ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }}
                                            onClick={() => setBgSub(k)}
                                        >
                                            {lbl}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-white"
                                    style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                    onClick={() => setBgModalOpen(true)}
                                >
                                    <Plus className="size-3" />
                                    添加背景
                                </button>
                            </div>

                            {state.panoramaUrl && state.backgroundKind !== "none" && (
                                <button
                                    type="button"
                                    className="w-full rounded-xl border border-red-500/30 bg-red-500/10 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-500/15"
                                    onClick={() => onApplyBackground("none", undefined)}
                                >
                                    清除当前 3D 背景图
                                </button>
                            )}

                            <div className="space-y-1.5">
                                <div className="text-[11px] font-semibold" style={{ color: theme.node.muted }}>
                                    我的背景 ({filteredBgs.length})
                                </div>
                                {filteredBgs.length ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {filteredBgs.map((b) => (
                                            <button
                                                key={b.id}
                                                type="button"
                                                className="overflow-hidden rounded-xl border text-left transition hover:border-[#37d39b]"
                                                style={{
                                                    borderColor: state.panoramaUrl === b.url ? theme.accent.base : softBorder,
                                                    background: theme.node.panel,
                                                }}
                                                onClick={() => onApplyBackground(b.kind, b.url)}
                                            >
                                                <img src={b.url} alt={b.name} className="h-16 w-full object-cover" />
                                                <div className="px-2 py-1">
                                                    <div className="truncate text-[10px] font-medium">{b.name}</div>
                                                    <div className="text-[9px]" style={{ color: theme.node.muted }}>
                                                        {b.kind === "panorama" ? "全景背景" : "平面背景"}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed p-4 text-center text-[11px]" style={{ borderColor: softBorder, color: theme.node.muted }}>
                                        还没有背景。上传图片，或从下方画布图片中选择。
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <div className="text-[11px] font-semibold" style={{ color: theme.node.muted }}>
                                    画布图片 ({canvasImages.length})
                                </div>
                                {canvasImages.length ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {canvasImages.map((img) => (
                                            <div
                                                key={img.id}
                                                className="overflow-hidden rounded-xl border"
                                                style={{ borderColor: softBorder, background: theme.node.panel }}
                                            >
                                                <img src={img.url} alt={img.title} className="h-14 w-full object-cover" />
                                                <div className="flex gap-1 p-1 text-[10px]">
                                                    <button
                                                        type="button"
                                                        className="flex-1 rounded-md py-0.5 hover:bg-[#0ea977]/20"
                                                        style={{ color: theme.accent.base }}
                                                        onClick={() => onApplyBackground("panorama", img.url)}
                                                    >
                                                        全景
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex-1 rounded-md py-0.5 hover:bg-[#0ea977]/20"
                                                        style={{ color: theme.node.text }}
                                                        onClick={() => onApplyBackground("plane", img.url)}
                                                    >
                                                        平面
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl p-3 text-center text-[11px]" style={{ background: theme.glass.inset, color: theme.node.muted }}>
                                        画布中暂无可用图片节点
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === "camera" && (
                        <div className="space-y-2">
                            {filteredCams.map((cp) => (
                                <button
                                    key={cp.id}
                                    type="button"
                                    className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition hover:border-[#37d39b]"
                                    style={{
                                        borderColor: cp.id === "current" ? theme.accent.base : softBorder,
                                        background: cp.id === "current" ? theme.accent.soft : theme.node.panel,
                                    }}
                                    onClick={() => onSelectCameraPreset(cp)}
                                >
                                    <Camera className="size-4 shrink-0" style={{ color: theme.accent.base }} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="truncate font-semibold">{cp.name}</span>
                                            <span className="font-mono text-[10px]" style={{ color: theme.node.muted }}>
                                                {cp.fov}°
                                            </span>
                                        </div>
                                        <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>
                                            {cp.desc}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </aside>

            {/* 导入角色 / 物体 3D 模型弹窗 */}
            {importKind && (
                <div
                    className="fixed inset-0 z-[160] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) setImportKind(null);
                    }}
                >
                    <div
                        className="w-full max-w-md space-y-4 rounded-2xl border p-5 text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">
                                {importKind === "character" ? "导入角色（Mixamo FBX / GLB）" : "导入物体（GLB / GLTF / FBX）"}
                            </div>
                            <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={() => setImportKind(null)}>
                                <X className="size-4" />
                            </button>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: theme.node.muted }}>
                            {importKind === "character"
                                ? "支持使用 Mixamo 骨架的 FBX 或 GLB 角色文件，导入后自动检测包围盒并按目标高度等比例缩放，底部自动贴地。"
                                : "支持 GLB、GLTF、FBX 三维模型文件，底部自动对齐地面并按目标高度等比例缩放，保存后存入「我的」。"}
                        </p>
                        <button
                            type="button"
                            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed py-5 transition hover:border-[#37d39b]"
                            style={{ borderColor: theme.node.stroke, background: theme.glass.inset }}
                            onClick={() => modelFileRef.current?.click()}
                        >
                            <Upload className="size-5" style={{ color: theme.accent.base }} />
                            <span className="font-medium">{importFile ? importFile.name : "点击选择 3D 模型文件"}</span>
                            <span className="text-[10px]" style={{ color: theme.node.muted }}>
                                {importKind === "character" ? ".fbx / .glb / .gltf" : ".glb / .gltf / .fbx"}
                            </span>
                        </button>
                        <input
                            ref={modelFileRef}
                            type="file"
                            accept={importKind === "character" ? ".fbx,.glb,.gltf" : ".glb,.gltf,.fbx"}
                            hidden
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) {
                                    setImportFile(f);
                                    if (!importName) setImportName(f.name.replace(/\.[^.]+$/, ""));
                                }
                            }}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className="text-[11px]" style={{ color: theme.node.muted }}>素材名称</span>
                                <input
                                    value={importName}
                                    onChange={(e) => setImportName(e.target.value)}
                                    placeholder="输入名称"
                                    className="h-8 w-full rounded-xl border px-2.5 outline-none"
                                    style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-[11px]" style={{ color: theme.node.muted }}>高度（米）</span>
                                <input
                                    type="number"
                                    step={0.05}
                                    min={0.1}
                                    max={20}
                                    value={importHeight}
                                    onChange={(e) => setImportHeight(Number(e.target.value) || 1)}
                                    className="h-8 w-full rounded-xl border px-2.5 font-mono outline-none"
                                    style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
                                />
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                className="h-8 rounded-xl border px-3.5"
                                style={{ borderColor: theme.node.stroke }}
                                onClick={() => setImportKind(null)}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                disabled={!importFile || importing}
                                className="h-8 rounded-xl px-4 font-semibold text-white disabled:opacity-40"
                                style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                                onClick={handleConfirmModelImport}
                            >
                                {importing ? "导入中…" : "保存到「我的」"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 选择背景类型弹窗 */}
            {bgModalOpen && (
                <div
                    className="fixed inset-0 z-[160] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) setBgModalOpen(false);
                    }}
                >
                    <div
                        className="w-full max-w-sm space-y-4 rounded-2xl border p-5 text-xs shadow-2xl"
                        style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">选择背景类型</div>
                            <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-white/10" onClick={() => setBgModalOpen(false)}>
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            {(
                                [
                                    ["panorama", "全景背景", "360° 环绕球体环境图"],
                                    ["plane", "平面背景", "舞台后方立式参考幕布"],
                                ] as const
                            ).map(([k, lbl, desc]) => (
                                <button
                                    key={k}
                                    type="button"
                                    className="rounded-xl border p-3 text-left transition"
                                    style={{
                                        borderColor: bgPickKind === k ? theme.accent.base : softBorder,
                                        background: bgPickKind === k ? theme.accent.soft : theme.node.panel,
                                    }}
                                    onClick={() => setBgPickKind(k)}
                                >
                                    <div className="font-semibold">{lbl}</div>
                                    <div className="mt-1 text-[10px]" style={{ color: theme.node.muted }}>
                                        {desc}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 font-semibold text-white"
                            style={{ background: "linear-gradient(135deg,#0ea977,#12896a)" }}
                            onClick={() => bgFileRef.current?.click()}
                        >
                            <Upload className="size-3.5" />
                            上传图片并应用
                        </button>
                        <input
                            ref={bgFileRef}
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) void handleUploadBg(f);
                            }}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
