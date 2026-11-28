import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Check, ChevronLeft, Film, Plus, Search, Sparkles, Trash2, Users, Video as VideoIcon, X } from "lucide-react";
import { nanoid } from "nanoid";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import {
    CHARACTER_SHEET_LABELS,
    characterSheetUrl,
    pushRecentVideoPromptId,
    readCustomVideoPrompts,
    readFavoriteMovementIds,
    readRecentVideoPromptIds,
    saveCustomVideoPrompts,
    toggleFavoriteMovementId,
    VIDEO_CHARACTERS,
    VIDEO_MOVEMENTS,
    VIDEO_OFFICIAL_PROMPTS,
    type VideoCharacterPreset,
    type VideoCharacterSheetKey,
    type VideoMovementPreset,
    type VideoPromptPreset,
} from "@/lib/canvas/video-presets";
import { useThemeStore } from "@/stores/use-theme-store";

const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

function OverlayFrame({
    open,
    title,
    subtitle,
    icon,
    widthClass = "max-w-[760px]",
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    widthClass?: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!open) return null;
    return createPortal(
        <div
            data-canvas-overlay
            data-canvas-no-zoom
            data-canvas-shortcuts-ignore
            role="dialog"
            aria-label={title}
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
            onPointerDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}
            onMouseDown={stop}
            onWheel={stop}
        >
            <div
                className={`bf-spring-pop flex max-h-[82dvh] w-full ${widthClass} flex-col overflow-hidden rounded-2xl border text-xs`}
                style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}
                onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") onClose(); }}
            >
                <header className="flex shrink-0 items-center gap-2.5 border-b px-4 py-3" style={{ borderColor: theme.glass.insetBorder }}>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: theme.accent.soft, color: theme.accent.base }}>{icon}</span>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{title}</div>
                        {subtitle && <div className="text-[11px]" style={{ color: theme.node.muted }}>{subtitle}</div>}
                    </div>
                    <button type="button" aria-label={`关闭${title}`} className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={onClose}><X className="size-4" /></button>
                </header>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
        </div>,
        document.body,
    );
}

/** 角色库弹窗：48 角色 × 4 视图（全身 / 面部特写 / 表情九宫格 / 人物看板） */
export function VideoCharacterLibraryModal({
    open,
    onClose,
    onPickSheet,
}: {
    open: boolean;
    onClose: () => void;
    onPickSheet: (item: { title: string; url: string }) => void | Promise<void>;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [category, setCategory] = useState("全部");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<VideoCharacterPreset | null>(null);
    const [pickingKey, setPickingKey] = useState<string | null>(null);

    const categories = useMemo(() => ["全部", ...Array.from(new Set(VIDEO_CHARACTERS.map((c) => c.category)))], []);
    const list = useMemo(() => {
        const kw = query.trim().toLowerCase();
        return VIDEO_CHARACTERS.filter((c) => (category === "全部" || c.category === category) && (!kw || c.name.toLowerCase().includes(kw) || c.category.toLowerCase().includes(kw)));
    }, [category, query]);

    const sheets: VideoCharacterSheetKey[] = ["full_body", "face_closeup", "expression_grid", "character_sheet"];

    const handlePick = async (character: VideoCharacterPreset, key: VideoCharacterSheetKey) => {
        const token = `${character.id}:${key}`;
        if (pickingKey) return;
        setPickingKey(token);
        try {
            await onPickSheet({
                title: `${character.name} · ${CHARACTER_SHEET_LABELS[key]}`,
                url: characterSheetUrl(character.id, key),
            });
            onClose();
        } finally {
            setPickingKey(null);
        }
    };

    return (
        <OverlayFrame
            open={open}
            title={selected ? `${selected.name} · 4 套参考图` : "公共角色库"}
            subtitle={selected ? `${selected.category} · 点击任意一张参考图即可连入当前视频节点` : `内置 ${VIDEO_CHARACTERS.length} 套多视角角色资产，离线可用`}
            icon={<Users className="size-4" />}
            widthClass="max-w-[820px]"
            onClose={() => { setSelected(null); onClose(); }}
        >
            {selected ? (
                <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="space-y-3">
                        <button type="button" className="inline-flex w-fit items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10" style={{ background: theme.glass.inset, color: theme.node.text }} onClick={() => setSelected(null)}>
                            <ChevronLeft className="size-3.5" />返回全部角色
                        </button>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {sheets.map((key) => {
                                const url = characterSheetUrl(selected.id, key);
                                const busy = pickingKey === `${selected.id}:${key}`;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        disabled={Boolean(pickingKey)}
                                        className="group flex flex-col overflow-hidden rounded-xl border text-left transition hover:border-[#0ea977] disabled:opacity-50"
                                        style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }}
                                        onClick={() => void handlePick(selected, key)}
                                    >
                                        <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-[#f5f6f8] dark:bg-[#14171d]">
                                            <img src={url} alt={CHARACTER_SHEET_LABELS[key]} loading="lazy" className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
                                            <span className="absolute bottom-2 right-2 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100" style={{ background: "#0ea977" }}>
                                                {busy ? "导入中…" : "选作参考"}
                                            </span>
                                        </div>
                                        <div className="shrink-0 px-2.5 py-2 font-medium">{CHARACTER_SHEET_LABELS[key]}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.glass.insetBorder }}>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                            {categories.map((cat) => (
                                <button key={cat} type="button" className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition" style={category === cat ? { background: theme.accent.soft, color: theme.accent.base } : { color: theme.node.muted }} onClick={() => setCategory(cat)}>
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <div className="flex h-8 w-44 items-center gap-1.5 rounded-xl border px-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                            <Search className="size-3.5 opacity-55" />
                            <input aria-label="搜索角色" placeholder="搜索角色…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
                        </div>
                    </div>
                    <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                            {list.map((character) => (
                                <div key={character.id} className="group flex flex-col overflow-hidden rounded-xl border transition hover:border-[#0ea977]" style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }}>
                                    <button type="button" className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-[#f5f6f8] text-left dark:bg-[#14171d]" onClick={() => setSelected(character)}>
                                        <img src={characterSheetUrl(character.id, "full_body")} alt={character.name} loading="lazy" className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
                                        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur">4 素材</span>
                                    </button>
                                    <div className="flex shrink-0 items-center justify-between gap-1 px-2 py-1.5">
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold">{character.name}</div>
                                            <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>{character.category}</div>
                                        </div>
                                        <button type="button" title="直接选全身图" disabled={Boolean(pickingKey)} className="shrink-0 rounded-md px-1.5 py-1 text-[10px] font-medium transition hover:brightness-110" style={{ background: theme.accent.soft, color: theme.accent.base }} onClick={() => void handlePick(character, "full_body")}>
                                            选用
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </OverlayFrame>
    );
}

/** 运镜广场弹窗：23 个运镜动态视频预览 + 分类 + 收藏 + 一键插入运镜提示词 */
export function VideoMovementLibraryModal({
    open,
    onClose,
    onSelectMovement,
}: {
    open: boolean;
    onClose: () => void;
    onSelectMovement: (movement: VideoMovementPreset) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [tab, setTab] = useState<"all" | "fav">("all");
    const [category, setCategory] = useState("全部");
    const [query, setQuery] = useState("");
    const [favorites, setFavorites] = useState<number[]>(() => readFavoriteMovementIds());

    const categories = ["全部", "推拉变焦", "摇移升降", "环绕跟拍", "特种视角"];
    const list = useMemo(() => {
        const kw = query.trim().toLowerCase();
        return VIDEO_MOVEMENTS.filter((m) => {
            if (tab === "fav" && !favorites.includes(m.id)) return false;
            if (category !== "全部" && m.category !== category) return false;
            if (kw && !m.name.toLowerCase().includes(kw) && !m.prompt.toLowerCase().includes(kw)) return false;
            return true;
        });
    }, [tab, favorites, category, query]);

    return (
        <OverlayFrame
            open={open}
            title="运镜广场"
            subtitle={`内置 ${VIDEO_MOVEMENTS.length} 种专业电影运镜动态预览，点击即可写入提示词`}
            icon={<VideoIcon className="size-4" />}
            widthClass="max-w-[820px]"
            onClose={onClose}
        >
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.glass.insetBorder }}>
                <div className="inline-flex rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                    {([["all", "运镜广场"], ["fav", `我的收藏 (${favorites.length})`]] as const).map(([key, label]) => (
                        <button key={key} type="button" className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition" style={tab === key ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }} onClick={() => setTab(key)}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    {categories.map((cat) => (
                        <button key={cat} type="button" className="rounded-lg px-2 py-1 text-[11px] transition" style={category === cat ? { background: theme.accent.soft, color: theme.accent.base } : { color: theme.node.muted }} onClick={() => setCategory(cat)}>
                            {cat}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex h-8 w-44 items-center gap-1.5 rounded-xl border px-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    <Search className="size-3.5 opacity-55" />
                    <input aria-label="搜索运镜名称" placeholder="搜索运镜名称…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
                </div>
            </div>
            <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {list.length ? list.map((item) => {
                        const fav = favorites.includes(item.id);
                        return (
                            <div key={item.id} className="group flex flex-col overflow-hidden rounded-xl border transition hover:border-[#0ea977]" style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }}>
                                <div className="relative aspect-video w-full shrink-0 cursor-pointer overflow-hidden bg-black" onClick={() => { onSelectMovement(item); onClose(); }}>
                                    <video
                                        src={item.media}
                                        muted
                                        loop
                                        playsInline
                                        preload="metadata"
                                        className="size-full object-cover"
                                        onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
                                        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                                    />
                                    <button
                                        type="button"
                                        aria-label={fav ? `取消收藏 ${item.name}` : `收藏 ${item.name}`}
                                        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-lg bg-black/55 text-white transition hover:bg-black/80"
                                        style={fav ? { color: "#37d39b" } : undefined}
                                        onClick={(e) => { e.stopPropagation(); setFavorites(toggleFavoriteMovementId(item.id)); }}
                                    >
                                        <Bookmark className={`size-3.5 ${fav ? "fill-current" : ""}`} />
                                    </button>
                                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{item.category}</span>
                                </div>
                                <button type="button" className="flex shrink-0 flex-col gap-0.5 px-2.5 py-2 text-left" onClick={() => { onSelectMovement(item); onClose(); }}>
                                    <span className="font-semibold">{item.name}</span>
                                    <span className="line-clamp-2 text-[10px] leading-snug" style={{ color: theme.node.muted }}>{item.prompt}</span>
                                </button>
                            </div>
                        );
                    }) : (
                        <div className="col-span-full py-12 text-center" style={{ color: theme.node.muted }}>暂无匹配的运镜预设</div>
                    )}
                </div>
            </div>
        </OverlayFrame>
    );
}

/** 预设提示词弹窗：官方 18 条 / 我的提示词库（支持新建/删除） / 最近使用 */
export function VideoPresetPromptsModal({
    open,
    onClose,
    onInsertPrompt,
}: {
    open: boolean;
    onClose: () => void;
    onInsertPrompt: (text: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [tab, setTab] = useState<"official" | "mine" | "recent">("official");
    const [query, setQuery] = useState("");
    const [customList, setCustomList] = useState<VideoPromptPreset[]>(() => readCustomVideoPrompts());
    const [recentIds, setRecentIds] = useState<string[]>(() => readRecentVideoPromptIds());
    const [creating, setCreating] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");
    const [draftContent, setDraftContent] = useState("");

    const allPresets = useMemo(() => [...customList, ...VIDEO_OFFICIAL_PROMPTS], [customList]);
    const visible = useMemo(() => {
        const kw = query.trim().toLowerCase();
        const base =
            tab === "official" ? VIDEO_OFFICIAL_PROMPTS
                : tab === "mine" ? customList
                    : recentIds.map((id) => allPresets.find((p) => p.id === id)).filter((p): p is VideoPromptPreset => Boolean(p));
        return base.filter((p) => !kw || p.title.toLowerCase().includes(kw) || p.content.toLowerCase().includes(kw) || p.category.toLowerCase().includes(kw));
    }, [tab, customList, recentIds, allPresets, query]);

    const handleInsert = (preset: VideoPromptPreset) => {
        setRecentIds(pushRecentVideoPromptId(preset.id));
        onInsertPrompt(preset.content);
        onClose();
    };

    const handleCreate = () => {
        if (!draftTitle.trim() || !draftContent.trim()) return;
        const item: VideoPromptPreset = { id: `custom-${nanoid()}`, title: draftTitle.trim(), category: "自定义", content: draftContent.trim(), custom: true };
        const next = [item, ...customList];
        setCustomList(next);
        saveCustomVideoPrompts(next);
        setDraftTitle(""); setDraftContent(""); setCreating(false); setTab("mine");
    };

    const handleDelete = (id: string) => {
        const next = customList.filter((item) => item.id !== id);
        setCustomList(next);
        saveCustomVideoPrompts(next);
    };

    return (
        <OverlayFrame open={open} title="预设提示词库" subtitle="点击任意预设即可追加到提示词，支持管理个人常用模板" icon={<Sparkles className="size-4" />} widthClass="max-w-[740px]" onClose={onClose}>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: theme.glass.insetBorder }}>
                <div className="inline-flex rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                    {([["official", `官方预设 (${VIDEO_OFFICIAL_PROMPTS.length})`], ["mine", `我的预设 (${customList.length})`], ["recent", "最近使用"]] as const).map(([key, label]) => (
                        <button key={key} type="button" className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition" style={tab === key ? { background: theme.node.panel, color: theme.accent.base } : { color: theme.node.muted }} onClick={() => setTab(key)}>
                            {label}
                        </button>
                    ))}
                </div>
                <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-110" style={{ background: theme.accent.soft, color: theme.accent.base }} onClick={() => setCreating((v) => !v)}>
                    <Plus className="size-3.5" />新建预设
                </button>
                <div className="ml-auto flex h-8 w-44 items-center gap-1.5 rounded-xl border px-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    <Search className="size-3.5 opacity-55" />
                    <input aria-label="搜索预设提示词" placeholder="搜索预设…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
                </div>
            </div>
            {creating && (
                <div className="shrink-0 space-y-2 border-b px-4 py-3" style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }}>
                    <input placeholder="预设标题（例如：电影感柔光运镜）" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className="h-8 w-full rounded-lg border px-2.5 text-xs outline-none" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }} />
                    <textarea rows={2} placeholder="输入要复用的提示词正文…" value={draftContent} onChange={(e) => setDraftContent(e.target.value)} className="w-full resize-none rounded-lg border p-2 text-xs outline-none" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }} />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="rounded-lg px-3 py-1 text-xs" style={{ color: theme.node.muted }} onClick={() => setCreating(false)}>取消</button>
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-white" style={{ background: "#0ea977" }} onClick={handleCreate}><Check className="size-3.5" />保存</button>
                    </div>
                </div>
            )}
            <div data-node-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {visible.length ? visible.map((preset) => (
                        <div key={preset.id} className="group flex flex-col justify-between gap-2 rounded-xl border p-3 transition hover:border-[#0ea977]" style={{ borderColor: theme.glass.insetBorder, background: theme.glass.inset }}>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">{preset.title}</span>
                                    <div className="flex items-center gap-1">
                                        <span className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: theme.node.panel, color: theme.node.muted }}>{preset.category}</span>
                                        {preset.custom && <button type="button" title="删除" className="rounded p-1 opacity-60 hover:text-red-500 hover:opacity-100" onClick={() => handleDelete(preset.id)}><Trash2 className="size-3" /></button>}
                                    </div>
                                </div>
                                <p className="m-0 line-clamp-3 text-[11px] leading-relaxed" style={{ color: theme.node.muted }}>{preset.content}</p>
                            </div>
                            <button type="button" className="inline-flex w-fit items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-110" style={{ background: theme.accent.soft, color: theme.accent.base }} onClick={() => handleInsert(preset)}>
                                <Film className="size-3" />插入到提示词
                            </button>
                        </div>
                    )) : (
                        <div className="col-span-full py-12 text-center" style={{ color: theme.node.muted }}>
                            {tab === "mine" ? "暂无自定义预设，点击上方「新建预设」创建" : tab === "recent" ? "暂无最近使用的预设" : "没有匹配的预设提示词"}
                        </div>
                    )}
                </div>
            </div>
        </OverlayFrame>
    );
}
