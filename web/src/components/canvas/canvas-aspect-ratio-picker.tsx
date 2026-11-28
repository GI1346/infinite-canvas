import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, Sparkles, X } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { parseAspectRatio } from "@/lib/media-size";

export type AspectRatioOption = {
    readonly value: string;
    readonly width: number;
    readonly height: number;
};

type OrientationLabels = {
    landscape: string;
    portrait: string;
    square: string;
    auto: string;
};

type AspectRatioPickerProps = {
    theme: CanvasTheme;
    options: readonly AspectRatioOption[];
    value: string;
    onChange: (ratio: string) => void;
    onDone?: () => void;
    title?: string;
    autoLabel?: string;
    orientationLabels?: OrientationLabels;
    allowCustom?: boolean;
    customLabel?: string;
    customActiveLabel?: string;
    customInputAriaLabel?: string;
    customPlaceholder?: string;
    customApplyLabel?: string;
    columns?: 3 | 5;
    resetCustomSignal?: number;
};

const MONO_FONT_FAMILY = "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)";

const DEFAULT_ORIENTATION_LABELS: OrientationLabels = {
    landscape: "横屏",
    portrait: "竖屏",
    square: "方形",
    auto: "自适应",
};

const IMAGE_RATIO_ORDER = [
    "1:1", "4:3", "3:4", "16:9", "9:16",
    "3:2", "2:3", "5:4", "4:5", "21:9",
    "2:1", "1:2", "3:1", "1:3", "9:21",
] as const;

const VIDEO_RATIO_ORDER = [
    "16:9", "9:16", "1:1",
    "4:3", "3:4", "21:9",
] as const;

export function normalizeCustomRatioDraft(raw: string) {
    return raw.trim().replace(/[：/×]/g, ":").replace(/\s+/g, "");
}

function orientationTag(value: string, labels: OrientationLabels) {
    if (!value || value === "auto") return labels.auto;
    const parsed = parseAspectRatio(value);
    if (!parsed) return "";
    if (Math.abs(parsed.width - parsed.height) < 1e-6) return labels.square;
    return parsed.width > parsed.height ? labels.landscape : labels.portrait;
}

export function AspectFrameGlyph({
    width,
    height,
    active,
    theme,
    size = "md",
}: {
    width: number;
    height: number;
    active?: boolean;
    theme: CanvasTheme;
    size?: "mini" | "md" | "lg";
}) {
    if (!width || !height || !Number.isFinite(width / height)) return null;
    const preset =
        size === "mini"
            ? { base: 11, maxW: 18, maxH: 13, min: 4 }
            : size === "lg"
              ? { base: 17, maxW: 32, maxH: 22, min: 6 }
              : { base: 15, maxW: 26, maxH: 20, min: 5.5 };

    const ratio = width / height;
    const sqrtRatio = Math.sqrt(ratio);
    let w = preset.base * sqrtRatio;
    let h = preset.base / sqrtRatio;
    if (w > preset.maxW) {
        const scale = preset.maxW / w;
        w = preset.maxW;
        h *= scale;
    }
    if (h > preset.maxH) {
        const scale = preset.maxH / h;
        h = preset.maxH;
        w *= scale;
    }
    w = Math.round(Math.max(preset.min, w));
    h = Math.round(Math.max(preset.min, h));
    const tightRadius = size === "mini" || Math.min(w, h) <= 7;

    return (
        <span
            aria-hidden="true"
            className={`inline-block shrink-0 transition-all duration-150 group-hover:scale-[1.06] ${tightRadius ? "rounded-[2px] border-[1.25px]" : "rounded-[3px] border-[1.5px]"}`}
            style={{
                width: w,
                height: h,
                borderColor: active ? theme.accent.base : theme.node.muted,
                background: active ? theme.accent.soft : theme.glass.inset,
                boxShadow: active ? `0 0 8px ${theme.accent.soft}` : undefined,
            }}
        />
    );
}

export function AspectRatioPicker({
    theme,
    options,
    value,
    onChange,
    onDone,
    title = "画幅比例",
    autoLabel = "自动",
    orientationLabels = DEFAULT_ORIENTATION_LABELS,
    allowCustom = false,
    customLabel = "自定义比例",
    customActiveLabel,
    customInputAriaLabel = "自定义比例",
    customPlaceholder = "9:1",
    customApplyLabel = "确定",
    columns,
    resetCustomSignal,
}: AspectRatioPickerProps) {
    const [customOpen, setCustomOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const customTriggerRef = useRef<HTMLButtonElement>(null);

    const hasAuto = options.some((item) => item.value === "auto");
    const isPreset = options.some((item) => item.value === value);
    const isCustomActive = Boolean(value && value !== "auto" && !isPreset);
    const activeCustomParsed = isCustomActive ? parseAspectRatio(value) : null;

    const numericOptions = useMemo(() => {
        const raw = options.filter((item) => item.value !== "auto");
        const order: readonly string[] = (columns ?? (raw.length <= 6 ? 3 : 5)) === 3 ? VIDEO_RATIO_ORDER : IMAGE_RATIO_ORDER;
        const rank = new Map(order.map((item, idx) => [item, idx]));
        return [...raw].sort((a, b) => (rank.get(a.value) ?? 999) - (rank.get(b.value) ?? 999));
    }, [columns, options]);

    const cols = columns ?? (numericOptions.length <= 6 ? 3 : 5);
    const parsedDraft = useMemo(() => parseAspectRatio(normalizeCustomRatioDraft(draft)), [draft]);
    const hasInvalidDraft = Boolean(draft.trim()) && !parsedDraft;
    const orientation = orientationTag(value, orientationLabels);

    useEffect(() => {
        if (resetCustomSignal === undefined) return;
        setCustomOpen(false);
    }, [resetCustomSignal]);

    const closeCustomForm = (restoreFocus = false) => {
        setCustomOpen(false);
        if (restoreFocus) {
            requestAnimationFrame(() => customTriggerRef.current?.focus({ preventScroll: true }));
        }
    };

    const pickRatio = (next: string) => {
        onChange(next);
        setCustomOpen(false);
        onDone?.();
    };

    const submitCustom = () => {
        if (!parsedDraft) return;
        const formatted = `${parsedDraft.width}:${parsedDraft.height}`;
        onChange(formatted);
        setCustomOpen(false);
        onDone?.();
    };

    const isAutoActive = value === "auto";
    const resolvedCustomLabel = isCustomActive ? (customActiveLabel ?? customLabel) : customLabel;

    return (
        <div
            data-canvas-shortcuts-ignore
            className="space-y-2.5"
            onMouseDown={(event) => event.stopPropagation()}
        >
            {/* 顶栏：标题 + 当前朝向提示 + 自适应开关 */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[11px] font-medium" style={{ color: theme.node.muted }}>
                        {title}
                    </span>
                    {orientation && (
                        <span
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none"
                            style={{
                                background: theme.glass.inset,
                                color: theme.node.faint,
                            }}
                        >
                            {orientation}
                        </span>
                    )}
                </div>
                {hasAuto && (
                    <button
                        type="button"
                        aria-pressed={isAutoActive}
                        className={`inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-1 ${
                            isAutoActive ? "" : "bg-black/[0.03] hover:bg-black/[0.07] dark:bg-white/[0.04] dark:hover:bg-white/[0.09]"
                        }`}
                        style={
                            isAutoActive
                                ? {
                                      background: theme.accent.soft,
                                      borderColor: theme.accent.base,
                                      color: theme.accent.base,
                                      fontSize: 11,
                                      lineHeight: 1,
                                      outlineColor: theme.accent.base,
                                  }
                                : {
                                      borderColor: theme.glass.insetBorder,
                                      color: theme.node.muted,
                                      fontSize: 11,
                                      lineHeight: 1,
                                      outlineColor: theme.accent.base,
                                  }
                        }
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => pickRatio("auto")}
                    >
                        <Sparkles aria-hidden="true" className="size-3 shrink-0" />
                        <span className="text-[11px] leading-none">{autoLabel}</span>
                    </button>
                )}
            </div>

            {/* 比例卡片网格（按真实画幅比例绘制几何框，无残缺行） */}
            <div className={cols === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-5 gap-1.5"}>
                {numericOptions.map((item) => {
                    const active = isPreset && item.value === value;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            aria-pressed={active}
                            className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border px-1 transition focus-visible:outline-2 focus-visible:outline-offset-1 ${
                                cols === 3 ? "h-[60px] gap-1.5" : "h-[54px] gap-1"
                            } ${
                                active ? "" : "bg-black/[0.03] hover:bg-black/[0.07] dark:bg-white/[0.04] dark:hover:bg-white/[0.09]"
                            }`}
                            style={
                                active
                                    ? {
                                          background: theme.accent.soft,
                                          borderColor: theme.accent.base,
                                          color: theme.accent.base,
                                          boxShadow: `inset 0 1px 0 ${theme.glass.highlight}, 0 0 0 1px ${theme.accent.soft}`,
                                          fontSize: 11,
                                          lineHeight: 1,
                                          outlineColor: theme.accent.base,
                                      }
                                    : {
                                          borderColor: theme.glass.insetBorder,
                                          color: theme.node.text,
                                          fontSize: 11,
                                          lineHeight: 1,
                                          outlineColor: theme.accent.base,
                                      }
                            }
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => pickRatio(item.value)}
                        >
                            <span className="flex h-6 w-full items-center justify-center">
                                <AspectFrameGlyph
                                    width={item.width}
                                    height={item.height}
                                    active={active}
                                    theme={theme}
                                    size={cols === 3 ? "lg" : "md"}
                                />
                            </span>
                            <span className="font-mono text-[11px] font-semibold leading-none tracking-tight">
                                {item.value}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* 自定义比例底栏 */}
            {allowCustom && (
                <div className="border-t pt-2" style={{ borderColor: theme.glass.insetBorder }}>
                    {customOpen ? (
                        <form
                            className="flex items-center gap-1.5"
                            onMouseDown={(event) => event.stopPropagation()}
                            onSubmit={(event) => {
                                event.preventDefault();
                                submitCustom();
                            }}
                        >
                            <div
                                className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 transition-colors"
                                style={{
                                    background: theme.glass.inset,
                                    borderColor: hasInvalidDraft
                                        ? "rgba(239, 68, 68, 0.65)"
                                        : parsedDraft
                                          ? theme.accent.base
                                          : theme.node.stroke,
                                }}
                            >
                                <span className="flex w-[18px] shrink-0 items-center justify-center">
                                    {parsedDraft ? (
                                        <AspectFrameGlyph width={parsedDraft.width} height={parsedDraft.height} active theme={theme} size="mini" />
                                    ) : (
                                        <span
                                            aria-hidden="true"
                                            className="inline-block size-3 rounded-[2px] border border-dashed"
                                            style={{ borderColor: hasInvalidDraft ? "rgba(239, 68, 68, 0.75)" : theme.node.faint }}
                                        />
                                    )}
                                </span>
                                <input
                                    autoFocus
                                    data-custom-ratio-input
                                    data-canvas-shortcuts-ignore
                                    aria-label={customInputAriaLabel}
                                    aria-invalid={hasInvalidDraft || undefined}
                                    placeholder={customPlaceholder}
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                        event.stopPropagation();
                                        const composing = event.nativeEvent.isComposing || event.keyCode === 229;
                                        if (composing) {
                                            if (event.key === "Enter") event.preventDefault();
                                            return;
                                        }
                                        if (event.key === "Escape") {
                                            event.preventDefault();
                                            closeCustomForm(true);
                                        }
                                    }}
                                    className="min-w-0 flex-1 bg-transparent outline-none"
                                    style={{
                                        color: theme.node.text,
                                        fontSize: 12,
                                        lineHeight: "16px",
                                        fontFamily: MONO_FONT_FAMILY,
                                    }}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!parsedDraft}
                                className="h-8 shrink-0 cursor-pointer rounded-xl px-3 font-semibold transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
                                style={{
                                    background: "linear-gradient(135deg, #0ea977, #12896a)",
                                    color: "#ffffff",
                                    fontSize: 12,
                                    lineHeight: 1,
                                    outlineColor: theme.accent.base,
                                }}
                            >
                                {customApplyLabel}
                            </button>
                            <button
                                type="button"
                                aria-label="取消自定义比例"
                                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-xl transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 dark:hover:bg-white/10"
                                style={{ color: theme.node.muted, outlineColor: theme.accent.base }}
                                onClick={() => closeCustomForm(true)}
                            >
                                <X className="size-3.5" />
                            </button>
                        </form>
                    ) : (
                        <button
                            ref={customTriggerRef}
                            type="button"
                            aria-pressed={isCustomActive}
                            className={`group flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-1 ${
                                isCustomActive ? "" : "bg-black/[0.025] hover:bg-black/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.08]"
                            }`}
                            style={
                                isCustomActive
                                    ? {
                                          background: theme.accent.soft,
                                          borderColor: theme.accent.base,
                                          color: theme.accent.base,
                                          fontSize: 12,
                                          lineHeight: 1,
                                          outlineColor: theme.accent.base,
                                      }
                                    : {
                                          borderColor: theme.glass.insetBorder,
                                          color: theme.node.muted,
                                          fontSize: 12,
                                          lineHeight: 1,
                                          outlineColor: theme.accent.base,
                                      }
                            }
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => {
                                setDraft(isCustomActive ? value : "");
                                setCustomOpen(true);
                            }}
                        >
                            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium leading-none">
                                <SlidersHorizontal aria-hidden="true" className="size-3.5 shrink-0 opacity-80" />
                                <span className="truncate">{resolvedCustomLabel}</span>
                            </span>
                            {isCustomActive && activeCustomParsed ? (
                                <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold leading-none">
                                    <AspectFrameGlyph width={activeCustomParsed.width} height={activeCustomParsed.height} active theme={theme} size="mini" />
                                    <span>{value}</span>
                                </span>
                            ) : !resolvedCustomLabel.includes(customPlaceholder) ? (
                                <span className="shrink-0 font-mono text-[10px] leading-none" style={{ color: theme.node.faint }}>
                                    {customPlaceholder}
                                </span>
                            ) : null}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
