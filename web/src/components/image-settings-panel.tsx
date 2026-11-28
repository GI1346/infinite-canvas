import { imageQualityForModel, imageQualityOptions as modelQualityOptions } from "@/lib/image-quality";
import { type ReactNode, useState } from "react";
import { ConfigProvider, Switch } from "antd";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { AspectRatioPicker } from "@/components/canvas/canvas-aspect-ratio-picker";
import { CapsuleSlider } from "@/components/canvas/canvas-capsule-slider";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions, readMediaDimensions } from "@/lib/media-size";
import type { AiConfig } from "@/stores/use-config-store";
import { decodeChannelModel, modelOptionName } from "@/stores/use-config-store";

const qualityOptions = [
    { value: "auto", labelKey: "auto" },
    { value: "low", labelKey: "low" },
    { value: "medium", labelKey: "medium" },
    { value: "high", labelKey: "high" },
    { value: "xhigh", labelKey: "xhigh" },
    { value: "max", labelKey: "max" },
];
const DIMENSION_STEP = 16;

export const imageQualityOptions = qualityOptions.map((item) => ({ value: item.value, get label() { return i18n.t(`settingsPanels.common.${item.labelKey}`); } }));
export const imageAspectOptions = mediaRatioOptions.map((item) => ({ value: item.value, label: item.value === "auto" ? i18n.t("settingsPanels.common.auto") : item.value }));
export const imageScaleOptions = mediaScaleOptions.map((value) => ({ value, label: value === "auto" ? i18n.t("settingsPanels.common.auto") : value }));

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "quality" | "size" | "count" | "background", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    maxCount?: number;
    quickCount?: number;
};

export function ImageSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5", maxCount = 15 }: ImageSettingsPanelProps) {
    const { t } = useTranslation();
    const [snapDimensionToStep, setSnapDimensionToStep] = useState(true);
    const qualityModel = config.model || config.imageModel;
    // Gemini 只有分辨率档位，没有 quality 参数；这里直接收窄，避免选了 quality 却被静默忽略。
    const qualityIgnored = geminiChannel(config, qualityModel);
    const supportedQualities = qualityIgnored ? [] : modelQualityOptions(qualityModel);
    const quality = imageQualityForModel(qualityModel, config.quality);
    const activeQualityList = qualityOptions.filter((item) => (supportedQualities.length ? supportedQualities.includes(item.value) : item.value === "auto"));
    const qualityIndex = Math.max(0, activeQualityList.findIndex((item) => item.value === quality));

    const count = Math.max(1, Math.min(maxCount, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const transparentBackground = config.background === "transparent";
    const selectedScale = inferMediaScale(activeSize);
    const selectedRatio = inferMediaRatio(activeSize);
    const scaleIndex = Math.max(0, mediaScaleOptions.findIndex((v) => v === selectedScale));
    const dimensions = readMediaDimensions(activeSize, selectedScale, selectedRatio);
    const applySize = (scale: string, ratio: string) => onConfigChange("size", computeMediaSize(scale, ratio));
    const selectScale = (scale: string) => applySize(scale, selectedRatio === "auto" ? "1:1" : selectedRatio);
    const selectRatio = (ratio: string) => applySize(selectedScale, ratio);
    const updateDimension = (key: "width" | "height", value: number | null) => {
        const next = Math.max(1, Math.floor(value || dimensions[key] || 1024));
        const width = key === "width" ? next : dimensions.width;
        const height = key === "height" ? next : dimensions.height;
        onConfigChange("size", `${alignDimension(width, snapDimensionToStep)}x${alignDimension(height, snapDimensionToStep)}`);
    };

    const countStops = Array.from(new Set([1, 2, 4, 6, 8, Math.min(12, maxCount), maxCount].filter((n) => n >= 1 && n <= maxCount))).map((n) => ({
        value: n,
        label: t("settingsPanels.image.images", { count: n }),
    }));

    return (
        <ImageSettingsTheme theme={theme}>
            <div
                className={className}
                style={{ color: theme.node.text }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    if (event.target instanceof HTMLInputElement) return;
                    if (document.activeElement instanceof HTMLInputElement && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
                }}
            >
                {showTitle ? <div className="text-base font-semibold">{t("settingsPanels.image.title")}</div> : null}

                {/* 质量滑块 */}
                <CapsuleSlider
                    theme={theme}
                    title={t("settingsPanels.image.quality")}
                    valueLabel={t(`settingsPanels.common.${activeQualityList[qualityIndex]?.labelKey || "auto"}`)}
                    min={0}
                    max={Math.max(0, activeQualityList.length - 1)}
                    value={qualityIndex}
                    ariaLabel={t("settingsPanels.image.quality")}
                    disabled={!supportedQualities.length}
                    stops={activeQualityList.map((item, idx) => ({ value: idx, label: t(`settingsPanels.common.${item.labelKey}`) }))}
                    onChange={(idx) => {
                        const picked = activeQualityList[idx];
                        if (picked) onConfigChange("quality", picked.value);
                    }}
                />

                {/* 清晰度 / 分辨率滑块 */}
                <CapsuleSlider
                    theme={theme}
                    title={t("settingsPanels.image.resolution")}
                    valueLabel={selectedScale === "auto" ? t("settingsPanels.common.auto") : selectedScale.toUpperCase()}
                    min={0}
                    max={mediaScaleOptions.length - 1}
                    value={scaleIndex}
                    ariaLabel={t("settingsPanels.image.resolution")}
                    stops={mediaScaleOptions.map((value, idx) => ({
                        value: idx,
                        label: value === "auto" ? t("settingsPanels.common.auto") : value.toUpperCase(),
                    }))}
                    onChange={(idx) => {
                        const picked = mediaScaleOptions[idx];
                        if (picked) selectScale(picked);
                    }}
                />

                {/* 比例点击选择（含等比画幅方框示意 + 自定义比例输入） */}
                <AspectRatioPicker
                    theme={theme}
                    options={mediaRatioOptions}
                    value={selectedRatio}
                    onChange={selectRatio}
                    title={t("settingsPanels.image.aspectRatio")}
                    autoLabel={t("settingsPanels.common.auto")}
                    orientationLabels={{
                        landscape: t("settingsPanels.video.sizes.landscape"),
                        portrait: t("settingsPanels.video.sizes.portrait"),
                        square: t("settingsPanels.video.sizes.square"),
                        auto: t("settingsPanels.video.adaptive"),
                    }}
                    allowCustom
                    customLabel={t("settingsPanels.image.customRatio")}
                    customActiveLabel={t("settingsPanels.image.customRatio").replace(/\s*[（(].*[）)]\s*$/, "")}
                    customInputAriaLabel={t("settingsPanels.image.customRatio")}
                    customApplyLabel={t("settingsPanels.image.customRatioApply")}
                />

                {/* 像素尺寸微调 */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.size")}</SettingTitle>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium" style={{ color: theme.node.muted }}>
                                {t("settingsPanels.image.align16")}
                            </span>
                            <span title={t("settingsPanels.image.align16Hint")} onMouseDown={(event) => event.stopPropagation()}>
                                <Switch size="small" checked={snapDimensionToStep} onChange={setSnapDimensionToStep} />
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <DimensionInput prefix="W" value={dimensions.width} disabled={selectedRatio === "auto"} theme={theme} alignToStep={snapDimensionToStep} onChange={(value) => updateDimension("width", value)} />
                        <span className="text-sm opacity-45">↔</span>
                        <DimensionInput prefix="H" value={dimensions.height} disabled={selectedRatio === "auto"} theme={theme} alignToStep={snapDimensionToStep} onChange={(value) => updateDimension("height", value)} />
                    </div>
                </div>

                {/* 生成数量滑块 */}
                <CapsuleSlider
                    theme={theme}
                    title={t("settingsPanels.image.count")}
                    valueLabel={t("settingsPanels.image.images", { count })}
                    min={1}
                    max={maxCount}
                    value={count}
                    ariaLabel={t("settingsPanels.image.count")}
                    stops={countStops}
                    onChange={(next) => onConfigChange("count", String(Math.max(1, Math.min(maxCount, next))))}
                />

                {/* 透明背景开关 */}
                <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="space-y-0.5">
                        <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.transparent")}</SettingTitle>
                        <div className="text-[11px]" style={{ color: theme.node.muted, opacity: 0.75 }}>
                            {t("settingsPanels.image.transparentHint")}
                        </div>
                    </div>
                    <span onMouseDown={(event) => event.stopPropagation()}>
                        <Switch size="small" checked={transparentBackground} onChange={(checked) => onConfigChange("background", checked ? "transparent" : "")} />
                    </span>
                </div>
            </div>
        </ImageSettingsTheme>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: {
                    Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text },
                    Slider: { railBg: theme.node.stroke, railHoverBg: theme.node.stroke, trackBg: theme.node.activeStroke, handleColor: theme.node.text, handleActiveColor: theme.node.text },
                },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function imageQualityLabel(value: string) {
    return qualityOptions.some((item) => item.value === value) ? i18n.t(`settingsPanels.common.${value}`) : value;
}

export function imageSizeLabel(size: string) {
    const scale = inferMediaScale(size);
    const ratio = inferMediaRatio(size);
    if (ratio === "auto" || size === "auto") return i18n.t("settingsPanels.common.auto");
    if (scale === "auto") return ratio;
    return `${scale.toUpperCase()} · ${ratio}`;
}

function DimensionInput({ prefix, value, disabled, theme, alignToStep, onChange }: { prefix: string; value: number; disabled: boolean; theme: CanvasTheme; alignToStep: boolean; onChange: (value: number | null) => void }) {
    const commit = (input: HTMLInputElement) => {
        const next = alignDimension(Math.max(1, Math.floor(Number(input.value) || value || 1024)), alignToStep);
        input.value = String(next);
        onChange(next);
    };

    return (
        <label className="flex h-8 overflow-hidden rounded-xl text-xs" style={{ background: theme.glass.inset, color: theme.node.text, opacity: disabled ? 0.55 : 1 }}>
            <span className="grid w-8 place-items-center font-semibold" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input
                type="number"
                min={1}
                disabled={disabled}
                className="min-w-0 flex-1 bg-transparent px-2 font-mono outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                defaultValue={value || ""}
                key={`${prefix}-${value}`}
                onBlur={(event) => commit(event.currentTarget)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                }}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-xs font-medium" style={{ color }}>
            {children}
        </div>
    );
}

function alignDimension(value: number, enabled: boolean) {
    return enabled ? Math.ceil(value / DIMENSION_STEP) * DIMENSION_STEP : value;
}

/** 当前生图模型是否落在 Gemini 渠道上（Gemini 没有 quality 参数，只有分辨率档位）。 */
function geminiChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const name = decoded?.model || modelOptionName(value);
    const channel = decoded
        ? config.channels.find((item) => item.id === decoded.channelId)
        : config.channels.find((item) => item.models.some((model) => model.name === name));
    return channel?.apiFormat === "gemini";
}
