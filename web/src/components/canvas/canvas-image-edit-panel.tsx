import { useEffect, useMemo, useRef, useState } from "react";

import { imageQualityForModel, imageQualityOptions } from "@/lib/image-quality";
import { computeMediaSize, mediaScaleOptions } from "@/lib/media-size";
import { ModelPicker } from "@/components/model-picker";
import type { AiConfig } from "@/stores/use-config-store";
import { Check, ChevronDown, Eye, ImagePlus, RotateCcw, X } from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

export type ImageEditPanelMode = "color" | "portrait" | "expression";

type ColorAdjustments = { vibrance: number; saturation: number; temperature: number; tint: number; hue: number; brightness: number };

const ZERO_ADJUSTMENTS: ColorAdjustments = { vibrance: 0, saturation: 0, temperature: 0, tint: 0, hue: 0, brightness: 0 };

/** 滤镜 / LUT：名字对齐即梦的分类观感，效果用同一条 CSS filter 串做预览与烘焙，保证所见即所得。 */
const FILTER_PRESETS: { name: string; css: string }[] = [
    { name: "无滤镜", css: "" },
    { name: "紫云", css: "saturate(1.18) hue-rotate(-12deg) contrast(1.05) brightness(1.02)" },
    { name: "富士蓝", css: "saturate(1.12) hue-rotate(8deg) contrast(1.08) brightness(1.03)" },
    { name: "爱乐之城", css: "sepia(.22) saturate(1.35) contrast(1.06) hue-rotate(-6deg)" },
    { name: "自然", css: "saturate(1.08) contrast(1.04)" },
    { name: "原生", css: "contrast(1.03) brightness(1.02)" },
    { name: "布朗", css: "sepia(.18) saturate(.92) contrast(1.05) brightness(.99)" },
    { name: "海盐", css: "saturate(.9) hue-rotate(12deg) brightness(1.05) contrast(1.02)" },
];

const LUT_PRESETS: { name: string; css: string }[] = [
    { name: "无 LUT", css: "" },
    { name: "港片霓虹", css: "contrast(1.2) saturate(1.5) hue-rotate(-14deg) brightness(.96)" },
    { name: "赛博冷绿", css: "hue-rotate(65deg) saturate(1.45) contrast(1.15)" },
    { name: "日落余晖", css: "sepia(.4) saturate(1.5) contrast(1.05) brightness(1.02)" },
    { name: "莫兰迪", css: "saturate(.55) contrast(.94) brightness(1.06)" },
    { name: "夜色霓虹", css: "contrast(1.25) saturate(1.6) hue-rotate(200deg) brightness(.94)" },
    { name: "复古唱片", css: "sepia(.5) saturate(1.3) contrast(.96) brightness(1.04)" },
    { name: "森林晨雾", css: "hue-rotate(28deg) saturate(.85) brightness(1.05) contrast(1.02)" },
    { name: "冰雪蓝调", css: "hue-rotate(-30deg) saturate(.9) brightness(1.08) contrast(1.08)" },
];

const PORTRAIT_PRESETS: { name: string; desc: string; std: string; enh: string }[] = [
    { name: "自然写实", desc: "重塑真实肤质，保留原生细节", std: "/presets/edit/portrait-std-1.webp", enh: "/presets/edit/portrait-enh-1.webp" },
    { name: "纪实肌理", desc: "呈现真实肌理，强化纪实质感", std: "/presets/edit/portrait-std-2.webp", enh: "/presets/edit/portrait-enh-2.webp" },
    { name: "时尚锐净", desc: "净化临时瑕疵，强化利落光影", std: "/presets/edit/portrait-std-3.webp", enh: "/presets/edit/portrait-enh-3.webp" },
    { name: "清透细腻", desc: "提升健康气色，塑造嫩滑奶油肌", std: "/presets/edit/portrait-std-4.webp", enh: "/presets/edit/portrait-enh-4.webp" },
    { name: "电影柔润", desc: "柔化高光层次，突出清晰五官", std: "/presets/edit/portrait-std-5.webp", enh: "/presets/edit/portrait-enh-5.webp" },
    { name: "柔焦颗粒", desc: "柔化清晰边缘，增添年代质感", std: "/presets/edit/portrait-std-6.webp", enh: "/presets/edit/portrait-enh-6.webp" },
];

/** 表情 → 即梦白膜（模特头）：每个表情 5 档强度各有独立渲染图，悬停/选中即换图。 */
const EXPRESSIONS: { label: string; prompt: string; heads: string[] }[] = [
    { label: "喜", prompt: "开心微笑，眉眼弯起", heads: [1, 2, 3, 4, 5].map((n) => `/presets/edit/expr-喜-${n}.webp`) },
    { label: "吃惊", prompt: "惊讶张嘴，眉毛上挑", heads: [1, 2, 3, 4, 5].map((n) => `/presets/edit/expr-吃惊-${n}.webp`) },
    { label: "困惑", prompt: "疑惑皱眉，微微歪头", heads: [1, 2, 3, 4, 5].map((n) => `/presets/edit/expr-困惑-${n}.webp`) },
    { label: "怒", prompt: "生气皱眉，抿紧嘴唇", heads: [1, 2, 3, 4, 5].map((n) => `/presets/edit/expr-怒-${n}.webp`) },
    { label: "悲伤", prompt: "难过低垂，眼角下垂", heads: [1, 2, 3, 4, 5].map((n) => `/presets/edit/expr-悲伤-${n}.webp`) },
];
const LEVELS = [1, 2, 3, 4, 5];

/** 出图比例：按节点实际宽高就近取常用比例，保证编辑结果与源图同形。 */
const RATIO_CANDIDATES = ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "4:5", "5:4"];

function nearestRatio(width: number, height: number) {
    if (!width || !height) return "3:4";
    const value = width / height;
    let best = "1:1";
    let bestGap = Number.POSITIVE_INFINITY;
    for (const ratio of RATIO_CANDIDATES) {
        const [w, h] = ratio.split(":").map(Number);
        const gap = Math.abs(w / h - value);
        if (gap < bestGap) { bestGap = gap; best = ratio; }
    }
    return best;
}

/** 调整项 → CSS filter：预览与烘焙共用同一条串，保证所见即所得。 */
export function buildAdjustFilter(a: ColorAdjustments, presetCss = "") {
    const parts: string[] = [];
    if (presetCss) parts.push(presetCss);
    const sat = 1 + (a.saturation * 0.9 + a.vibrance * 0.35) / 100;
    if (Math.abs(sat - 1) > 0.008) parts.push(`saturate(${sat.toFixed(3)})`);
    const bright = 1 + (a.brightness * 0.45) / 100;
    if (Math.abs(bright - 1) > 0.008) parts.push(`brightness(${bright.toFixed(3)})`);
    if (a.hue) parts.push(`hue-rotate(${(a.hue * 1.8).toFixed(1)}deg)`);
    if (a.temperature > 0) parts.push(`sepia(${(a.temperature * 0.4 / 100).toFixed(3)}) saturate(${(1 + a.temperature * 0.12 / 100).toFixed(3)})`);
    if (a.temperature < 0) parts.push(`saturate(${(1 - a.temperature * 0.1 / 100).toFixed(3)}) hue-rotate(${(-a.temperature * 0.14).toFixed(1)}deg)`);
    if (a.tint) parts.push(`hue-rotate(${(a.tint * 0.4).toFixed(1)}deg)`);
    return parts.join(" ");
}

async function loadImage(src: string) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = src;
    await image.decode();
    return image;
}

type Props = {
    node: CanvasNodeData;
    mode: ImageEditPanelMode;
    theme: CanvasTheme;
    config: AiConfig;
    screen: { x: number; y: number; w: number; h: number };
    running: boolean;
    onClose: () => void;
    onPreviewFilter: (nodeId: string, filter: string | null) => void;
    onBakeImage: (nodeId: string, dataUrl: string, title: string) => void;
    onRunAiEdit: (args: { node: CanvasNodeData; title: string; prompt: string; model: string; size: string; quality: string }) => void;
};

/** 即梦同款的三个图片编辑面板：图片调色（本地实时）/ 人像质感 / 表情调节（走图生图）。 */
export function CanvasImageEditPanel({ node, mode, theme, config, screen, running, onClose, onPreviewFilter, onBakeImage, onRunAiEdit }: Props) {
    const [model, setModel] = useState(config.model);
    const [resolution, setResolution] = useState("2k");
    const [quality, setQuality] = useState(imageQualityForModel(model, config.quality));
    const qualityOptions = imageQualityOptions(model);
    const [tab, setTab] = useState<"adjust" | "filter" | "match" | "lut">("adjust");
    const [adjust, setAdjust] = useState<ColorAdjustments>(ZERO_ADJUSTMENTS);
    const [presetCss, setPresetCss] = useState("");
    const [presetName, setPresetName] = useState("");
    const [matchThumb, setMatchThumb] = useState<string | null>(null);
    const [comparingOriginal, setComparingOriginal] = useState(false);
    const [portraitPreset, setPortraitPreset] = useState(PORTRAIT_PRESETS[0].name);
    const [portraitStrength, setPortraitStrength] = useState<"标准" | "增强">("标准");
    const [hoverPreset, setHoverPreset] = useState<string | null>(null);
    const [expression, setExpression] = useState(EXPRESSIONS[0].label);
    const [level, setLevel] = useState(1);
    const [hoverDot, setHoverDot] = useState<{ label: string; level: number } | null>(null);
    const matchFileRef = useRef<HTMLInputElement>(null);
    const dirty = useMemo(() => JSON.stringify(adjust) !== JSON.stringify(ZERO_ADJUSTMENTS) || Boolean(presetCss), [adjust, presetCss]);
    const cssFilter = useMemo(() => buildAdjustFilter(adjust, presetCss), [adjust, presetCss]);
    // 人像质感 / 表情调节：即梦用固定演示图做实时预览（真实生成仍以节点原图为参考）。
    // 悬停任意一项即预览该效果，点击才真正选中。
    const activePreset = PORTRAIT_PRESETS.find((item) => item.name === (hoverPreset || portraitPreset)) || PORTRAIT_PRESETS[0];
    const portraitPreview = portraitStrength === "标准" ? activePreset.std : activePreset.enh;
    const activeDot = hoverDot || { label: expression, level };
    const currentHead = EXPRESSIONS.find((item) => item.label === activeDot.label)?.heads[activeDot.level - 1] || EXPRESSIONS[0].heads[0];
    const nodeImage = mode === "portrait" ? portraitPreview : node.metadata?.content || "";

    // 实时预览：把 filter 写到节点元数据上，由节点渲染层套用；关闭 / 确认时由父级清除。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        onPreviewFilter(node.id, mode === "color" && cssFilter && !comparingOriginal ? cssFilter : null);
    }, [comparingOriginal, cssFilter, mode, node.id]);

    useEffect(() => {
        if (!comparingOriginal) return;
        const end = () => setComparingOriginal(false);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        return () => {
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
        };
    }, [comparingOriginal]);

    const resetColor = () => {
        setAdjust(ZERO_ADJUSTMENTS);
        setPresetCss("");
        setPresetName("");
        setMatchThumb(null);
        setComparingOriginal(false);
    };

    // Esc 关闭面板（与即梦一致）
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const pickMatchImage = async (file: File) => {
        // AI 追色（本地实现）：把参考图的平均色彩偏移换算成色温 / 色调 / 饱和度调整。
        const reader = new FileReader();
        reader.onload = async () => {
            const [sourceAvg, targetAvg] = await Promise.all([averageColor(node.metadata?.content || ""), averageColor(String(reader.result))]);
            const dr = targetAvg[0] - sourceAvg[0], dg = targetAvg[1] - sourceAvg[1], db = targetAvg[2] - sourceAvg[2];
            const temperature = Math.max(-100, Math.min(100, Math.round(((dr - db) / 2) * 2.4)));
            const tint = Math.max(-100, Math.min(100, Math.round((dg - (dr + db) / 2) * 3)));
            const saturation = Math.max(-100, Math.min(100, Math.round((Math.max(...targetAvg) - Math.min(...targetAvg) - (Math.max(...sourceAvg) - Math.min(...sourceAvg))) * 1.6)));
            setMatchThumb(String(reader.result));
            setPresetCss("");
            setPresetName("AI 追色");
            setAdjust({ ...ZERO_ADJUSTMENTS, temperature, tint, saturation });
        };
        reader.readAsDataURL(file);
    };

    const confirmColor = async () => {
        const source = node.metadata?.content;
        if (!source || (!dirty && !presetName)) return;
        const image = await loadImage(source);
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.filter = cssFilter || "none";
        context.drawImage(image, 0, 0);
        context.filter = "none";
        const dataUrl = canvas.toDataURL("image/png");
        onBakeImage(node.id, dataUrl, presetName ? `${node.title || "图片"} · ${presetName}` : node.title);
        onClose();
    };

    const runPortrait = () => {
        const preset = PORTRAIT_PRESETS.find((item) => item.name === portraitPreset) || PORTRAIT_PRESETS[0];
        const prompt = `对这张人像照片进行「${preset.name}」人像质感处理：${preset.desc}。保持人物的身份、五官结构、发型、服装、姿势、背景与画面内容完全不变，仅优化皮肤质感与整体光影。${portraitStrength === "增强" ? "处理力度明显增强。" : "处理效果自然克制。"}`;
        onRunAiEdit({ node, title: `${node.title || "人像"} · ${portraitPreset}`, prompt, model, size: computeMediaSize(resolution, outputRatio), quality });
    };

    const runExpression = () => {
        const target = EXPRESSIONS.find((item) => item.label === expression) || EXPRESSIONS[0];
        const prompt = `将画面中人物的表情调整为「${target.label}」（${target.prompt}），情绪强度 ${level}/5（1 为轻微，5 为强烈）。保持人物的身份、五官结构、发型、服装、姿势、背景与画面内容完全不变，仅改变面部表情。`;
        onRunAiEdit({ node, title: `${node.title || "人像"} · ${target.label}`, prompt, model, size: computeMediaSize(resolution, outputRatio), quality });
    };

    const width = mode === "color" ? 300 : mode === "portrait" ? 540 : 452;
    const left = Math.max(16, Math.min(screen.x + screen.w / 2 - width / 2, (typeof window !== "undefined" ? window.innerWidth : 1920) - width - 16));
    const below = screen.y + screen.h + 16;
    const top = below + (mode === "color" ? 330 : 340) > window.innerHeight ? Math.max(64, screen.y - (mode === "color" ? 340 : 360)) : below;
    const isLight = theme === canvasThemes.light;
    const outputRatio = useMemo(() => nearestRatio(node.width, node.height), [node.width, node.height]);

    return (
        <div
            data-canvas-overlay
            data-canvas-no-zoom
            className="fixed z-[520] p-4"
            style={{ left, top, width, background: theme.node.panel, color: theme.node.text, borderRadius: 16, boxShadow: isLight ? "0 10px 34px rgba(15,23,42,.16)" : "0 14px 44px rgba(0,0,0,.6)", border: `1px solid ${isLight ? "rgba(15,23,42,.06)" : "rgba(255,255,255,.06)"}` }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="mb-1 flex items-start justify-between">
                <div className="min-w-0">
                    <div className="text-[13px] font-medium leading-5">{mode === "color" ? "图片调色" : mode === "portrait" ? "人像质感" : "表情调节"}</div>
                    {mode === "portrait" ? <p className="m-0 mt-0.5 text-[11px]" style={{ color: theme.node.faint }}>调整肤质与光线质感，保持角色身份和画面内容不变</p> : null}
                </div>
                <button type="button" className="ml-2 grid size-6 shrink-0 place-items-center rounded-md opacity-50 transition hover:opacity-100" onClick={onClose} aria-label="关闭">
                    <X size={14} />
                </button>
            </div>

            {mode === "color" ? (
                <>
                    <div className="mb-2 flex items-center gap-4 text-[12px]">
                        {([["adjust", "调色"], ["filter", "滤镜"], ["match", "AI 追色"], ["lut", "LUT"]] as const).map(([key, label]) => (
                            <button key={key} type="button" className="relative pb-1.5 pt-1 transition" style={{ color: tab === key ? theme.node.text : theme.node.faint }} onClick={() => setTab(key)}>
                                {label}
                                {tab === key ? <span className="absolute inset-x-0 -bottom-px mx-auto h-[2px] w-4 rounded-full" style={{ background: theme.node.text }} /> : null}
                            </button>
                        ))}
                    </div>
                    {tab === "adjust" ? (
                        <div>
                            {([["vibrance", "自然饱和度"], ["saturation", "饱和度"], ["temperature", "色温"], ["tint", "色调"], ["hue", "色相"], ["brightness", "亮度"]] as const).map(([key, label]) => (
                                <div key={key} className="flex h-9 items-center gap-2.5">
                                    <span className="w-[68px] shrink-0 whitespace-nowrap text-[12px]" style={{ color: theme.node.muted }}>{label}</span>
                                    <input
                                        type="range"
                                        aria-label={label}
                                        className="jm-range min-w-0 flex-1"
                                        min={-100}
                                        max={100}
                                        value={adjust[key]}
                                        style={{ ["--jm-rail" as string]: isLight ? "#ededed" : "#3a3a3a", ["--jm-thumb" as string]: isLight ? "#8c8c8c" : "#d4d4d4" }}
                                        onChange={(event) => setAdjust((prev) => ({ ...prev, [key]: Number(event.target.value) }))}
                                    />
                                    <AdjustValueInput label={label} value={adjust[key]} theme={theme} onChange={(next) => setAdjust((prev) => ({ ...prev, [key]: next }))} />
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {tab === "filter" || tab === "lut" ? (
                        <div className="grid grid-cols-4 gap-x-2 gap-y-2">
                            {(tab === "filter" ? FILTER_PRESETS : LUT_PRESETS).map((preset) => {
                                const selected = presetName === preset.name || (!presetName && preset.name.startsWith("无"));
                                return (
                                    <button key={preset.name} type="button" className="space-y-1 text-center" onClick={() => { setPresetCss(preset.css); setPresetName(preset.name.startsWith("无") ? "" : preset.name); }}>
                                        <span className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-md" style={{ boxShadow: selected ? `inset 0 0 0 1.5px ${theme.node.text}` : `inset 0 0 0 1px ${isLight ? "rgba(15,23,42,.08)" : "rgba(255,255,255,.1)"}` }}>
                                            {preset.css ? <img src={nodeImage} alt="" className="size-full object-cover" style={{ filter: preset.css }} /> : <span className="text-[13px]" style={{ color: theme.node.faint }}>⊘</span>}
                                        </span>
                                        <span className="block truncate text-[11px]" style={{ color: selected ? theme.node.text : theme.node.faint }}>{preset.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                    {tab === "match" ? (
                        <div className="space-y-2">
                            <button type="button" className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-[12px] transition hover:opacity-80" style={{ borderColor: theme.node.stroke, color: theme.node.faint }} onClick={() => matchFileRef.current?.click()}>
                                {matchThumb ? <img src={matchThumb} alt="" className="size-full rounded-lg object-cover" /> : <><ImagePlus size={18} />上传参考图，自动匹配色调</>}
                            </button>
                            <input ref={matchFileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void pickMatchImage(file); event.target.value = ""; }} />
                            <p className="m-0 text-[11px]" style={{ color: theme.node.faint }}>本地比对两张图的平均色彩并换算成色温 / 色调，不消耗额度。</p>
                        </div>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                aria-label="按住对比原图"
                                title="按住查看原图效果"
                                disabled={!dirty}
                                className="inline-flex h-[30px] select-none items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-white/10"
                                style={comparingOriginal ? { background: theme.accent.soft, color: theme.accent.base } : { background: theme.glass.inset, color: theme.node.muted }}
                                onPointerDown={(event) => { event.stopPropagation(); setComparingOriginal(true); }}
                                onPointerUp={() => setComparingOriginal(false)}
                                onPointerCancel={() => setComparingOriginal(false)}
                                onPointerLeave={() => setComparingOriginal(false)}
                            >
                                <Eye size={13} />对比原图
                            </button>
                            <button
                                type="button"
                                aria-label="重置调色"
                                title="重置全部调色参数与滤镜"
                                disabled={!dirty && !presetName && !matchThumb}
                                className="inline-flex h-[30px] items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-white/10"
                                style={{ background: theme.glass.inset, color: theme.node.muted }}
                                onClick={resetColor}
                            >
                                <RotateCcw size={12} />重置
                            </button>
                        </div>
                        <button type="button" className="h-[30px] rounded-lg px-4 text-[12px] font-medium transition hover:opacity-90 disabled:cursor-not-allowed" style={{ background: dirty || presetName ? theme.node.text : isLight ? "#f2f2f2" : "#333333", color: dirty || presetName ? theme.node.panel : isLight ? "#b8b8b8" : "#6f6f6f" }} disabled={!dirty && !presetName} onClick={() => void confirmColor()}>
                            确认
                        </button>
                    </div>
                </>
            ) : null}

            {mode === "portrait" ? (
                <>
                    <div className="mt-2 flex gap-4">
                        <div className="relative w-[228px] shrink-0 overflow-hidden rounded-xl">
                            <img src={nodeImage} alt="" className="aspect-[3/4] w-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 flex p-2">
                                <div className="flex w-full overflow-hidden rounded-lg p-0.5" style={{ background: "rgba(0,0,0,.42)", backdropFilter: "blur(8px)" }}>
                                    {(["标准", "增强"] as const).map((item) => (
                                        <button key={item} type="button" className="flex-1 rounded-md py-1 text-[12px] transition" style={{ background: portraitStrength === item ? "rgba(255,255,255,.22)" : "transparent", color: portraitStrength === item ? "#ffffff" : "rgba(255,255,255,.72)" }} onClick={() => setPortraitStrength(item)}>{item}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-between gap-0.5">
                            {PORTRAIT_PRESETS.map((preset) => {
                                const selected = preset.name === portraitPreset;
                                return (
                                    <button
                                        key={preset.name}
                                        type="button"
                                        className="flex min-h-[42px] items-center gap-2 rounded-lg px-3 py-1 text-left transition"
                                        style={{ background: selected ? theme.glass.inset : hoverPreset === preset.name ? (isLight ? "rgba(15,23,42,.04)" : "rgba(255,255,255,.05)") : "transparent" }}
                                        onMouseEnter={() => setHoverPreset(preset.name)}
                                        onMouseLeave={() => setHoverPreset((prev) => (prev === preset.name ? null : prev))}
                                        onClick={() => setPortraitPreset(preset.name)}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] leading-[18px]" style={{ color: theme.node.text }}>{preset.name}</span>
                                            <span className="block truncate text-[11px] leading-[15px]" style={{ color: theme.node.faint }}>{preset.desc}</span>
                                        </span>
                                        {selected ? <Check size={14} className="shrink-0" style={{ color: theme.node.text }} /> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <PanelFooter theme={theme} config={config} model={model} onModel={setModel} resolution={resolution} onResolution={setResolution} quality={quality} onQuality={setQuality} qualityOptions={qualityOptions} running={running} label="生成" onRun={runPortrait} />
                </>
            ) : null}

            {mode === "expression" ? (
                <>
                    <div className="mt-2 flex gap-4">
                        <img src={currentHead} alt="" className="size-[190px] shrink-0 rounded-xl object-cover" style={{ background: "#f2f2f2" }} />
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                            {EXPRESSIONS.map((item) => (
                                <div key={item.label} className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="w-9 shrink-0 truncate text-left text-[12px]"
                                        style={{ color: expression === item.label || hoverDot?.label === item.label ? theme.node.text : theme.node.faint }}
                                        onClick={() => { setExpression(item.label); setLevel(1); }}
                                    >
                                        {item.label}
                                    </button>
                                    <div className="flex min-w-0 flex-1 items-center justify-between">
                                        {LEVELS.map((value) => {
                                            const selected = expression === item.label && level === value;
                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    aria-label={`${item.label} 强度 ${value}`}
                                                    className="grid size-4 place-items-center rounded-full transition"
                                                    style={selected ? { background: isLight ? theme.node.panel : theme.node.text, boxShadow: `0 0 0 1.5px ${isLight ? "#d4d4d4" : "transparent"}` } : {}}
                                                    onMouseEnter={() => setHoverDot({ label: item.label, level: value })}
                                                    onMouseLeave={() => setHoverDot((prev) => (prev && prev.label === item.label && prev.level === value ? null : prev))}
                                                    onClick={() => { setExpression(item.label); setLevel(value); }}
                                                >
                                                    {selected ? null : <span className="size-[5px] rounded-full" style={{ background: theme.node.muted }} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            <div className="flex items-center justify-between pl-11 text-[11px]" style={{ color: theme.node.faint }}>
                                <span>轻微</span>
                                <span>强烈</span>
                            </div>
                        </div>
                    </div>
                    <PanelFooter theme={theme} config={config} model={model} onModel={setModel} resolution={resolution} onResolution={setResolution} quality={quality} onQuality={setQuality} qualityOptions={qualityOptions} running={running} label="生成" onRun={runExpression} />
                </>
            ) : null}
        </div>
    );
}

/** 调色数值框：可直接点进去输入，回车 / 失焦生效，Esc 取消，范围 -100~100。 */
function AdjustValueInput({ label, value, theme, onChange }: { label: string; value: number; theme: CanvasTheme; onChange: (next: number) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    const commit = () => {
        if (draft === null) return;
        const parsed = Number(draft.trim());
        if (draft.trim() !== "" && Number.isFinite(parsed)) onChange(Math.max(-100, Math.min(100, Math.round(parsed))));
        setDraft(null);
    };
    return (
        <input
            aria-label={`${label}数值`}
            inputMode="numeric"
            data-canvas-shortcuts-ignore
            className="h-[26px] w-9 shrink-0 rounded-lg border bg-transparent text-center text-[12px] outline-none transition-colors focus:border-current"
            style={{ borderColor: theme.node.stroke, color: draft === null ? theme.node.muted : theme.node.text }}
            value={draft ?? String(value)}
            onFocus={(event) => { setDraft(String(value)); event.currentTarget.select(); }}
            onChange={(event) => setDraft(event.target.value.replace(/[^\d-]/g, "").slice(0, 4))}
            onBlur={commit}
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") { commit(); event.currentTarget.blur(); }
                if (event.key === "Escape") { setDraft(null); event.currentTarget.blur(); }
            }}
        />
    );
}

function PanelFooter({ theme, config, model, onModel, resolution, onResolution, quality, onQuality, qualityOptions, running, label, onRun }: { theme: CanvasTheme; config: AiConfig; model: string; onModel: (v: string) => void; resolution: string; onResolution: (v: string) => void; quality: string; onQuality: (v: string) => void; qualityOptions: string[]; running: boolean; label: string; onRun: () => void }) {
    const isLight = theme === canvasThemes.light;
    const selectClass = "h-8 appearance-none rounded-full px-2 pr-5 text-[12px] outline-none";
    const selectStyle = { background: isLight ? "#f4f4f4" : "#2a2a2a", color: theme.node.muted };
    const chevron = <ChevronDown size={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2" style={{ color: theme.node.faint }} />;
    return (
        <div className="mt-3 flex items-center gap-2">
            <div className="w-[150px] shrink-0"><ModelPicker className="!h-8 !gap-1 !rounded-full !px-2.5 !text-[12px]" config={config} value={model} onChange={(next) => onModel(next)} capability="image" groupByChannel="list" fullWidth /></div>
            <span className="min-w-4 flex-1" />
            <span className="relative shrink-0">
                <select aria-label="输出分辨率" value={resolution} className={selectClass} style={selectStyle} onChange={(event) => onResolution(event.target.value)}>
                    {mediaScaleOptions.filter((item) => item !== "auto").map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
                </select>
                {chevron}
            </span>
            <span className="relative max-w-24 shrink-0">
                <select aria-label="生成质量" value={quality} className={selectClass} style={selectStyle} onChange={(event) => onQuality(event.target.value)}>
                    {(qualityOptions.length ? qualityOptions : ["auto"]).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                {chevron}
            </span>
            <button type="button" className="h-8 shrink-0 rounded-full px-4 text-[13px] font-medium transition hover:opacity-90 disabled:opacity-50" style={{ background: theme.node.text, color: theme.node.panel }} disabled={running} onClick={onRun}>
                {running ? "生成中…" : label}
            </button>
        </div>
    );
}

async function averageColor(src: string): Promise<[number, number, number]> {
    const image = await loadImage(src);
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return [128, 128, 128];
    context.drawImage(image, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    let r = 0, g = 0, b = 0;
    const total = size * size;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    return [r / total, g / total, b / total];
}
