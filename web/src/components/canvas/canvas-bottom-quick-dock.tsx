import { App } from "antd";
import { ChevronDown, FileText, History, ImagePlus, Image as ImageIcon, Send, Sparkles, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { nanoid } from "nanoid";
import { ModelPicker } from "@/components/model-picker";
import { canvasGlass, canvasThemes } from "@/lib/canvas-theme";
import { getGenerationCount, newGenerationMetadata } from "@/lib/canvas/canvas-generation-helpers";
import { imageQualityForModel, imageQualityOptions } from "@/lib/image-quality";
import { inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";
import { ensureImagePreview, getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "@/types/canvas";
import { AspectRatioPicker } from "./canvas-aspect-ratio-picker";
import { CapsuleSlider } from "./canvas-capsule-slider";
import { VideoPresetPromptsModal } from "./canvas-video-modals";

export interface QuickDockHistoryItem { id: string; text: string; createdAt: number; refCount: number }
export interface QuickDockSubmission {
    prompt: string;
    sourceNodeIds: string[];
    extraUploads: Array<{ id: string; url: string; name: string }>;
    model: string;
    aspectRatio: string;
    resolution: string;
    quality: string;
    count: number;
}
export interface CanvasBottomQuickDockProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    selectedNodes: CanvasNodeData[];
    onSelectNodeIds: (nodeIds: string[]) => void;
    onOpenHarnessFromDock: () => void;
    onSubmitGenerate: (payload: QuickDockSubmission) => Promise<{ createdNodeIds: string[] } | void>;
    onFocusNodes: (nodeIds: string[]) => void;
}

const historyKey = "blinkflow:quick-dock-prompt-history";
export const quickDockOpenKey = "blinkflow:quick-dock-open";
const control = "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40";
const stop = (event: { stopPropagation(): void }) => event.stopPropagation();
const historyLimit = 50;
function readHistory(): QuickDockHistoryItem[] {
    try {
        const data = JSON.parse(localStorage.getItem(historyKey) || "[]");
        return Array.isArray(data) ? data.filter((item) => typeof item?.text === "string" && typeof item.id === "string" && Number.isFinite(item.createdAt) && Number.isFinite(item.refCount)).slice(0, historyLimit) : [];
    } catch { return []; }
}
const relativeTime = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
function timeSince(time: number) {
    const minutes = Math.floor(Math.max(0, Date.now() - time) / 60_000);
    return minutes < 1 ? "刚刚" : minutes < 60 ? relativeTime.format(-minutes, "minute") : minutes < 1440 ? relativeTime.format(-Math.floor(minutes / 60), "hour") : relativeTime.format(-Math.floor(minutes / 1440), "day");
}

function QuickReferenceImage({ url, storageKey }: { url?: string; storageKey?: string }) {
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    useEffect(() => { if (storageKey) void ensureImagePreview(storageKey); }, [storageKey]);
    return <img src={previewUrlFor(storageKey) || url} alt="" draggable={false} className="size-full object-cover" />;
}

function QuickDockParamMenu({
    label,
    ariaLabel,
    display,
    accentValue,
    disabled,
    wide,
    onOpenChange,
    children,
}: {
    label: string;
    ariaLabel: string;
    display: string;
    accentValue?: boolean;
    disabled?: boolean;
    wide?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: (close: () => void) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const changeOpen = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
    return (
        <Popover.Root open={open && !disabled} onOpenChange={changeOpen}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    aria-label={ariaLabel}
                    title={label}
                    disabled={disabled}
                    data-canvas-no-zoom
                    className="inline-flex h-6 items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-semibold leading-none transition hover:brightness-110 disabled:opacity-45"
                    style={{
                        color: accentValue ? theme.accent.base : theme.node.text,
                        background: open ? theme.accent.soft : theme.node.panel,
                    }}
                >
                    <span className="truncate font-mono">{display}</span>
                    <ChevronDown className="size-3 shrink-0 opacity-55" style={{ color: theme.node.muted }} />
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    aria-label={`${label}选项`}
                    data-canvas-overlay
                    data-canvas-no-zoom
                    side="top"
                    align="center"
                    sideOffset={10}
                    collisionPadding={12}
                    className={`bf-spring-pop z-[1250] max-w-[calc(100vw-24px)] border shadow-2xl outline-none ${wide ? "rounded-2xl p-3" : "rounded-xl p-2.5"}`}
                    style={{
                        width: wide ? 340 : 248,
                        background: theme.node.panel,
                        color: theme.node.text,
                        borderColor: theme.node.stroke,
                    }}
                    onEscapeKeyDown={(event) => {
                        if (event.target instanceof HTMLElement && event.target.hasAttribute("data-custom-ratio-input")) {
                            event.preventDefault();
                        }
                    }}
                    onPointerDown={stop}
                    onMouseDown={stop}
                    onWheel={stop}
                >
                    {children(() => changeOpen(false))}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

export function CanvasBottomQuickDock({ isOpen, onOpenChange, selectedNodes, onSelectNodeIds, onOpenHarnessFromDock, onSubmitGenerate, onFocusNodes }: CanvasBottomQuickDockProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)], config = useEffectiveConfig();
    const { message } = App.useApp();
    const [defaults] = useState(() => newGenerationMetadata(config));
    const [selectedModel, setModel] = useState<string>();
    const model = resolveModelForCapability(config, selectedModel ?? defaults.model, "image");
    const [ratio, setRatio] = useState(defaults.imageAspectRatio || inferMediaRatio(defaults.size || config.size));
    const [ratioOpenVersion, setRatioOpenVersion] = useState(0);
    const [resolution, setResolution] = useState(defaults.imageResolution || inferMediaScale(defaults.size || config.size));
    const [quality, setQuality] = useState(defaults.quality || config.quality);
    const [count, setCount] = useState(getGenerationCount(String(defaults.count || config.canvasImageCount || config.count)));
    const [prompt, setPrompt] = useState(""), [history, setHistory] = useState(readHistory);
    const [historyOpen, setHistoryOpen] = useState(false), [presetModalOpen, setPresetModalOpen] = useState(false), [query, setQuery] = useState("");
    const [uploads, setUploads] = useState<QuickDockSubmission["extraUploads"]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [last, setLast] = useState<Pick<QuickDockSubmission, "prompt" | "sourceNodeIds" | "extraUploads" | "count"> & { createdNodeIds: string[] }>();
    const submittingRef = useRef(false), editorRef = useRef<HTMLTextAreaElement>(null), uploadRef = useRef<HTMLInputElement>(null);
    const uploadUrls = useRef(new Set<string>());
    const dockRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const dock = dockRef.current, surface = dock?.closest<HTMLElement>("[data-canvas-project-surface]");
        if (!dock || !surface) return;
        const measure = () => surface.style.setProperty("--canvas-quick-dock-height", `${dock.offsetHeight}px`);
        const observer = new ResizeObserver(measure);
        observer.observe(dock); measure();
        return () => { observer.disconnect(); surface.style.removeProperty("--canvas-quick-dock-height"); };
    }, []);
    useEffect(() => { const urls = uploadUrls.current; return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); }; }, []);
    useEffect(() => { if (!isOpen) setHistoryOpen(false); }, [isOpen]);
    useEffect(() => {
        const retained = new Set([...uploads, ...(last?.extraUploads ?? [])].map(({ url }) => url));
        uploadUrls.current.forEach((url) => { if (!retained.has(url)) { URL.revokeObjectURL(url); uploadUrls.current.delete(url); } });
    }, [uploads, last]);

    const saveHistory = (next: QuickDockHistoryItem[]) => {
        setHistory(next);
        try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* Keep session history if storage is full. */ }
    };
    const submit = async () => {
        const text = prompt.trim();
        if (submittingRef.current || !text) return;
        submittingRef.current = true; setSubmitting(true);
        const sourceNodeIds = selectedNodes.map(({ id }) => id);
        const payload = { prompt: text, sourceNodeIds, extraUploads: uploads, model, aspectRatio: ratio, resolution, quality: imageQualityForModel(model, quality), count };
        try {
            const result = await onSubmitGenerate(payload);
            if (!result?.createdNodeIds.length) return;
            saveHistory([{ id: nanoid(), text, createdAt: Date.now(), refCount: selectedNodes.filter(({ type }) => type === "image").length + uploads.length }, ...history.filter((item) => item.text !== text)].slice(0, historyLimit));
            setLast({ ...payload, count: result.createdNodeIds.length, createdNodeIds: result.createdNodeIds });
            setPrompt(""); setUploads([]); setHistoryOpen(false);
        } catch (error) { message.error(error instanceof Error ? error.message : "无法创建图片任务"); }
        finally { submittingRef.current = false; setSubmitting(false); }
    };
    const fillPrompt = (value: string) => { setPrompt(value); setHistoryOpen(false); editorRef.current?.focus(); };
    const insertPresetPrompt = (text: string) => {
        const clean = text.trim();
        if (!clean) return;
        setPrompt((prev) => {
            const base = prev.trim();
            if (!base) return clean;
            if (base.includes(clean)) return prev;
            return `${base}，${clean}`;
        });
        editorRef.current?.focus();
    };

    const visibleHistory = history.filter(({ text }) => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    const border = { borderColor: theme.glass.border };
    const refs = [...selectedNodes.map((node) => ({ id: node.id, title: node.title, type: node.type, url: node.metadata?.content, storageKey: node.metadata?.storageKey, upload: false })), ...uploads.map(({ id, name, url }) => ({ id, title: name, type: "image", url, storageKey: undefined, upload: true }))];
    let imageNumber = 0, textNumber = 0;
    const remove = (id: string, upload: boolean) => upload ? setUploads((all) => all.filter((item) => item.id !== id)) : onSelectNodeIds(selectedNodes.filter((node) => node.id !== id).map((node) => node.id));

    const resIdx = Math.max(0, mediaScaleOptions.findIndex((item) => item === resolution));
    const supportedQualities = imageQualityOptions(model);
    const qualityList = supportedQualities.length ? supportedQualities : ["auto"];
    const activeQuality = imageQualityForModel(model, quality);
    const qualityIdx = Math.max(0, qualityList.findIndex((item) => item === activeQuality));

    return <div ref={dockRef} data-canvas-quick-dock data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore className="absolute bottom-4 left-1/2 z-[60] -translate-x-1/2" onMouseDown={stop} onPointerDown={stop}>
        {!isOpen ? <button type="button" aria-expanded={false} className="flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold hover:brightness-110" style={{ ...canvasGlass(theme), color: theme.node.text }} onClick={() => onOpenChange(true)}><ImageIcon className="size-4" style={{ color: theme.accent.base }} />图片生成{selectedNodes.length > 0 && <span className="rounded-full px-1.5 py-0.5 font-mono text-[10px]" style={{ background: theme.accent.soft }}>已选 {selectedNodes.length} 项</span>}</button> :
        <section aria-label="快捷生图舱" className="bf-spring-pop relative flex w-[min(680px,max(300px,calc(100vw-320px)))] max-w-[calc(100vw-24px)] flex-col gap-2 rounded-[20px] border px-3 py-2.5" style={{ ...canvasGlass(theme), color: theme.node.text }}>
            <header className="flex min-w-0 items-center gap-2">
                <ImageIcon className="size-4 shrink-0" style={{ color: theme.accent.base }} /><strong className="text-xs">图片生成</strong>
                <span className="ml-auto truncate text-[10px]" style={{ color: theme.node.muted }}>Enter 换行 · Ctrl+Enter 生成</span>
                <button type="button" aria-label="收起快捷生图舱" className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10" onClick={() => onOpenChange(false)}><X className="size-3.5" /></button>
            </header>
            {refs.length > 0 && <div aria-label="快捷生图参考素材" data-node-scroll className="thin-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto py-0.5">
                {refs.map((item) => {
                    const image = item.type === "image";
                    const label = image ? `图${++imageNumber}` : `文本${++textNumber}`;
                    return <div key={item.id} title={item.title} className={`group relative shrink-0 border ${image ? "size-12 overflow-hidden rounded-xl" : "inline-flex h-7 items-center gap-1 rounded-full pl-2 pr-6 text-[11px]"}`} style={{ ...border, background: theme.glass.inset }}>
                        {image ? <><QuickReferenceImage url={item.url} storageKey={item.storageKey} /><span className="absolute left-0 top-0 rounded-br-md bg-black/75 px-1 py-0.5 font-mono text-[10px] font-bold text-[#37d39b]">{label}</span></> : <><FileText className="size-3.5" />{label}</>}
                        <button type="button" aria-label={`移除${label}`} disabled={submitting} className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100" style={{ color: theme.node.text, background: theme.toolbar.panel }} onClick={() => remove(item.id, item.upload)}><X className="size-3" /></button>
                    </div>;
                })}
            </div>}
            <textarea ref={editorRef} data-auto-pair-quotes aria-label="快捷生图提示词" value={prompt} disabled={submitting} onChange={(event) => setPrompt(event.currentTarget.value)} placeholder="写下想生成的画面，选中的图片和文本会自动连线。" className="thin-scrollbar h-[76px] w-full resize-none overscroll-contain rounded-xl border px-2.5 py-2 text-xs leading-relaxed outline-none focus:!border-[#0ea977]" style={{ ...border, background: theme.glass.inset }}
                onKeyDown={(event) => { event.stopPropagation(); if (!event.nativeEvent.isComposing && event.keyCode !== 229 && !event.repeat && (event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }} />
            <div className="relative flex flex-wrap items-center gap-1">
                <button type="button" className={control} style={{ color: theme.accent.base }} onClick={onOpenHarnessFromDock}>Harness</button>
                <button type="button" className={control} disabled={submitting} onClick={() => setPresetModalOpen(true)}>
                    <Sparkles className="size-3.5" style={{ color: theme.accent.base }} />预设提示词
                </button>
                <button type="button" className={control} aria-expanded={historyOpen} onClick={() => { setQuery(""); setHistoryOpen(!historyOpen); }}><History className="size-3.5" />历史{history.length > 0 && <span className="font-mono opacity-70">{history.length}</span>}</button>
                <button type="button" className={control} aria-label="上传快捷参考图" title="上传参考图" disabled={submitting} onClick={() => uploadRef.current?.click()}><ImagePlus className="size-4" /></button>
                <input ref={uploadRef} type="file" multiple accept="image/*" hidden onChange={(event) => {
                    const files = Array.from(event.currentTarget.files || []).filter((file) => file.type.startsWith("image/"));
                    const added = files.map((file) => { const url = URL.createObjectURL(file); uploadUrls.current.add(url); return { id: nanoid(), url, name: file.name }; });
                    setUploads((all) => [...all, ...added]); event.currentTarget.value = "";
                }} />
                <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                    <div className="min-w-0 max-w-[140px] flex-1"><ModelPicker config={config} value={model} onChange={setModel} fullWidth groupByChannel="list" menuZoom={1} disabled={submitting} capability="image" ariaLabel="快捷生图模型" className="!h-7 !min-w-0 !gap-1 !rounded-xl !px-2 !text-[11px] [&>span:first-child]:size-4 [&>span:first-child]:text-[9px]" onMissingConfig={() => useConfigStore.getState().openConfigDialog(true)} /></div>
                    <div className="inline-flex h-7 items-center gap-0.5 rounded-xl p-0.5" style={{ background: theme.glass.inset }}>
                        <QuickDockParamMenu
                            label="比例"
                            ariaLabel="快捷生图比例"
                            display={ratio === "auto" ? "自动" : ratio}
                            disabled={submitting}
                            wide
                            onOpenChange={(open) => {
                                if (open) setRatioOpenVersion((v) => v + 1);
                            }}
                        >
                            {(closeMenu) => (
                                <AspectRatioPicker
                                    theme={theme}
                                    options={mediaRatioOptions}
                                    value={ratio}
                                    onChange={setRatio}
                                    onDone={closeMenu}
                                    title="画幅比例"
                                    allowCustom
                                    customLabel="自定义比例"
                                    customInputAriaLabel="自定义快捷生图比例"
                                    resetCustomSignal={ratioOpenVersion}
                                />
                            )}
                        </QuickDockParamMenu>
                        <QuickDockParamMenu label="清晰度" ariaLabel="快捷生图清晰度" display={resolution === "auto" ? "自动" : resolution.toUpperCase()} disabled={submitting}>
                            {() => (
                                <CapsuleSlider
                                    theme={theme}
                                    title="清晰度"
                                    valueLabel={resolution === "auto" ? "自动" : resolution.toUpperCase()}
                                    min={0}
                                    max={mediaScaleOptions.length - 1}
                                    value={resIdx}
                                    ariaLabel="快捷生图清晰度滑块"
                                    stops={mediaScaleOptions.map((item, i) => ({ value: i, label: item === "auto" ? "自动" : item.toUpperCase() }))}
                                    onChange={(nextIdx) => {
                                        const picked = mediaScaleOptions[nextIdx];
                                        if (picked) setResolution(picked);
                                    }}
                                />
                            )}
                        </QuickDockParamMenu>
                        <QuickDockParamMenu label="质量" ariaLabel="快捷生图质量" display={activeQuality === "auto" ? "自动" : activeQuality} disabled={submitting || !supportedQualities.length}>
                            {() => (
                                <CapsuleSlider
                                    theme={theme}
                                    title="生成质量"
                                    valueLabel={activeQuality === "auto" ? "自动" : activeQuality}
                                    min={0}
                                    max={Math.max(0, qualityList.length - 1)}
                                    value={qualityIdx}
                                    ariaLabel="快捷生图质量滑块"
                                    stops={qualityList.map((item, i) => ({ value: i, label: item === "auto" ? "自动" : item }))}
                                    onChange={(nextIdx) => {
                                        const picked = qualityList[nextIdx];
                                        if (picked) setQuality(picked);
                                    }}
                                />
                            )}
                        </QuickDockParamMenu>
                        <QuickDockParamMenu label="张数" ariaLabel="快捷生图张数" display={`${count}张`} accentValue disabled={submitting}>
                            {() => (
                                <CapsuleSlider
                                    theme={theme}
                                    title="生成数量"
                                    valueLabel={`${count}张`}
                                    min={1}
                                    max={15}
                                    value={count}
                                    ariaLabel="快捷生图数量滑块"
                                    stops={[
                                        { value: 1, label: "1张" },
                                        { value: 2, label: "2张" },
                                        { value: 4, label: "4张" },
                                        { value: 8, label: "8张" },
                                        { value: 15, label: "15张" },
                                    ]}
                                    onChange={(next) => setCount(Math.max(1, Math.min(15, next)))}
                                />
                            )}
                        </QuickDockParamMenu>
                    </div>
                    <button type="button" aria-label="提交快捷生图" title="生成 (Ctrl+Enter)" disabled={!prompt.trim() || submitting} className="grid size-7 shrink-0 place-items-center rounded-xl text-white shadow-sm transition hover:opacity-95 disabled:opacity-40" style={{ backgroundImage: "linear-gradient(135deg, #0ea977, #12896a)" }} onClick={() => void submit()}><Send className="size-3.5" /></button>
                </div>
            </div>
            {historyOpen && <div data-canvas-overlay data-canvas-no-zoom data-canvas-shortcuts-ignore aria-label="快捷生图历史提示词" className="bf-spring-pop absolute bottom-full left-0 z-10 mb-2 w-full rounded-2xl border p-2" style={{ ...canvasGlass(theme), backgroundColor: theme.toolbar.panel, color: theme.node.text }}>
                <div className="flex items-center gap-1"><input autoFocus aria-label="搜索历史提示词" placeholder="搜索历史提示词" value={query} onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Escape") setHistoryOpen(false); }} className="h-8 min-w-0 flex-1 rounded-lg border px-2 text-xs" style={{ ...border, background: theme.node.panel }} /><button type="button" className={control} disabled={!history.length} onClick={() => saveHistory([])}>清空</button><button type="button" className={control} aria-label="关闭历史提示词" onClick={() => setHistoryOpen(false)}><X className="size-4" /></button></div>
                <div data-node-scroll className="thin-scrollbar mt-1 max-h-56 overflow-auto overscroll-contain">{visibleHistory.length ? visibleHistory.map((item) => <div key={item.id} className="group flex items-start rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><button type="button" className="min-w-0 flex-1 p-2 text-left" onClick={() => fillPrompt(item.text)}><span className="line-clamp-2 whitespace-pre-wrap break-words text-xs">{item.text}</span><span className="mt-1 block text-[10px]" style={{ color: theme.node.muted }}>{timeSince(item.createdAt)} · {item.refCount} 张参考图</span></button><button type="button" className={`${control} mt-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`} aria-label={`删除提示词 ${item.text}`} onClick={(event) => { event.stopPropagation(); saveHistory(history.filter(({ id }) => id !== item.id)); }}><X className="size-3.5" /></button></div>) : <p className="p-3 text-xs" style={{ color: theme.node.muted }}>{query ? "没有匹配的提示词" : "还没有历史提示词"}</p>}</div>
            </div>}
            {last && <div className="flex flex-wrap items-center gap-1 border-t pt-1 text-[11px]" style={{ ...border, color: theme.node.muted }}><span>已创建 {last.count} 个图片任务</span><button type="button" className={control} style={{ color: theme.accent.base }} onClick={() => onFocusNodes(last.createdNodeIds)}>查看任务</button><button type="button" className={control} onClick={() => { fillPrompt(last.prompt); setUploads(last.extraUploads); onSelectNodeIds(last.sourceNodeIds); }}>恢复上次输入</button></div>}
        </section>}
        <VideoPresetPromptsModal open={presetModalOpen} onClose={() => setPresetModalOpen(false)} onInsertPrompt={insertPresetPrompt} />
    </div>;
}
