export const mediaScaleOptions = ["1k", "2k", "4k", "auto"] as const;
export const mediaRatioOptions = [
    { value: "1:1", width: 1, height: 1 },
    { value: "2:3", width: 2, height: 3 },
    { value: "3:2", width: 3, height: 2 },
    { value: "3:4", width: 3, height: 4 },
    { value: "4:3", width: 4, height: 3 },
    { value: "4:5", width: 4, height: 5 },
    { value: "5:4", width: 5, height: 4 },
    { value: "9:16", width: 9, height: 16 },
    { value: "16:9", width: 16, height: 9 },
    { value: "21:9", width: 21, height: 9 },
    { value: "2:1", width: 2, height: 1 },
    { value: "1:2", width: 1, height: 2 },
    { value: "3:1", width: 3, height: 1 },
    { value: "1:3", width: 1, height: 3 },
    { value: "9:21", width: 9, height: 21 },
    { value: "auto", width: 0, height: 0 },
] as const;

export const imageSizePresets: Record<string, Record<string, string>> = {
    "1k": { "1:1": "1024x1024", "2:3": "1024x1536", "3:2": "1536x1024", "4:3": "1024x768", "3:4": "768x1024", "4:5": "1024x1280", "5:4": "1280x1024", "16:9": "1536x864", "9:16": "864x1536", "21:9": "2016x864", "9:21": "864x2016", "2:1": "1536x768", "1:2": "768x1536", "3:1": "1536x512", "1:3": "512x1536" },
    "2k": { "1:1": "2048x2048", "2:3": "1360x2048", "3:2": "2048x1360", "4:3": "2048x1536", "3:4": "1536x2048", "4:5": "1632x2048", "5:4": "2048x1632", "16:9": "2048x1152", "9:16": "1152x2048", "21:9": "2688x1152", "9:21": "1152x2688", "2:1": "2048x1024", "1:2": "1024x2048", "3:1": "2016x672", "1:3": "672x2016" },
    "4k": { "1:1": "2880x2880", "2:3": "2336x3520", "3:2": "3520x2336", "4:3": "3312x2480", "3:4": "2480x3312", "4:5": "2560x3200", "5:4": "3200x2560", "16:9": "3840x2160", "9:16": "2160x3840", "21:9": "3840x1648", "9:21": "1648x3840", "2:1": "3840x1920", "1:2": "1920x3840", "3:1": "3840x1280", "1:3": "1280x3840" },
};

export function parsePixelSize(value: string) {
    const match = String(value || "").match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

export function parseAspectRatio(value: string) {
    const match = String(value || "").match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return null;
    return { width, height };
}

/** 比例化成整数（1.5:1 → 3:2），再约分，用于按比例算出精确像素尺寸。 */
export function integerAspectRatio(width: number, height: number) {
    let w = width, h = height;
    for (let i = 0; i < 3 && (!Number.isInteger(w) || !Number.isInteger(h)); i++) { w *= 10; h *= 10; }
    const divisor = gcd(Math.round(w), Math.round(h)) || 1;
    return { width: Math.max(1, Math.round(w) / divisor), height: Math.max(1, Math.round(h) / divisor) };
}

function gcd(a: number, b: number): number {
    return b ? gcd(b, a % b) : Math.abs(a);
}

export const videoRatioOptions = [
    { value: "1:1", width: 1, height: 1 },
    { value: "3:4", width: 3, height: 4 },
    { value: "4:3", width: 4, height: 3 },
    { value: "16:9", width: 16, height: 9 },
    { value: "9:16", width: 9, height: 16 },
    { value: "21:9", width: 21, height: 9 },
    { value: "auto", width: 0, height: 0 },
] as const;

export const VIDEO_SECONDS_MIN = 4;
export const VIDEO_SECONDS_MAX = 30;

export function normalizeMediaScale(value: string | undefined) {
    const scale = String(value || "").trim().toLowerCase();
    if (scale === "2k" || scale === "2048") return "2k";
    if (scale === "4k" || scale === "3840") return "4k";
    if (scale === "auto") return "auto";
    if (mediaScaleOptions.includes(scale as (typeof mediaScaleOptions)[number])) return scale;
    return "1k";
}

export function inferMediaScale(size: string, storedScale?: string) {
    if (storedScale) return normalizeMediaScale(storedScale);
    if (!size || size === "auto") return "auto";
    if (parseAspectRatio(size)) return "auto";
    const pixels = parsePixelSize(size);
    if (!pixels) return "auto";
    const presetScale = Object.keys(imageSizePresets).find((scale) => Object.values(imageSizePresets[scale]).includes(`${pixels.width}x${pixels.height}`));
    if (presetScale) return presetScale;
    const longSide = Math.max(pixels.width, pixels.height);
    if (longSide >= 3072) return "4k";
    if (longSide >= 1536) return "2k";
    return "1k";
}

export function inferMediaRatio(size: string, fallback = "1:1") {
    if (!size || size === "auto") return "auto";
    if (mediaRatioOptions.some((item) => item.value === size)) return size;
    // 显式的比例字符串（9:1、6:1 这类不在预设里的）原样返回，不再吸附到最接近的 3:1。
    const ratio = parseAspectRatio(size);
    if (ratio) return `${formatRatioPart(ratio.width)}:${formatRatioPart(ratio.height)}`;
    const pixels = parsePixelSize(size);
    if (!pixels) return fallback;
    const target = pixels.width / pixels.height;
    const nearest = mediaRatioOptions
        .filter((item) => item.value !== "auto")
        .reduce((best, item) => {
            const current = item.width / item.height;
            const bestOption = mediaRatioOptions.find((option) => option.value === best);
            const bestRatio = (bestOption?.width || 1) / Math.max(1, bestOption?.height || 1);
            return Math.abs(current - target) < Math.abs(bestRatio - target) ? item.value : best;
        }, fallback);
    const nearestOption = mediaRatioOptions.find((option) => option.value === nearest);
    // 预设尺寸（2k/4k 的 3:2 是 2048x1360 这种非整比）误差很小，仍按预设显示；
    // 自定义比例算出来的尺寸是精确整数比，直接显示约分后的真实比例。
    if (nearestOption && Math.abs(nearestOption.width / nearestOption.height / target - 1) <= 0.005) return nearest;
    const reduced = integerAspectRatio(pixels.width, pixels.height);
    return `${reduced.width}:${reduced.height}`;
}

function formatRatioPart(value: number) {
    return String(Math.round(value * 1000) / 1000);
}

/** 自定义比例按 8 的倍数取整，保证尺寸仍是 8 的倍数且比例精确（9:1、6:1 不会有小数残差）。 */
const RATIO_LONG_SIDE: Record<string, number> = { "1k": 1536, "2k": 2048, "4k": 3840 };

export function computeMediaSize(scale: string, ratio: string) {
    if (ratio === "auto" || !ratio) return "auto";
    const normalizedScale = normalizeMediaScale(scale);
    if (normalizedScale === "auto") return ratio;
    const preset = imageSizePresets[normalizedScale]?.[ratio];
    if (preset) return preset;
    const parsed = parseAspectRatio(ratio);
    if (!parsed) return ratio;
    const exact = integerAspectRatio(parsed.width, parsed.height);
    const longSide = RATIO_LONG_SIDE[normalizedScale] || RATIO_LONG_SIDE["1k"];
    const step = Math.max(8, Math.floor(longSide / Math.max(exact.width, exact.height) / 8) * 8);
    return `${exact.width * step}x${exact.height * step}`;
}

export function readMediaDimensions(size: string, scale: string, ratio: string) {
    const pixels = parsePixelSize(size);
    if (pixels) return pixels;
    const computed = computeMediaSize(scale === "auto" ? "1k" : scale, ratio === "auto" ? "1:1" : ratio);
    return parsePixelSize(computed) || { width: 0, height: 0 };
}

export function clampVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(VIDEO_SECONDS_MIN, Math.min(VIDEO_SECONDS_MAX, seconds)));
}

export function parseVideoResolution(value: string | undefined) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "low") return "480";
    if (raw === "auto" || raw === "high" || raw === "medium") return "720";
    const number = raw.replace(/p$/i, "");
    return /^\d+$/.test(number) && Number(number) > 0 ? number : "720";
}

export function inferVideoRatio(size: string) {
    if (!size || size === "auto") return "auto";
    if (videoRatioOptions.some((item) => item.value === size)) return size;
    const pixels = parsePixelSize(size) || parseAspectRatio(size);
    if (!pixels) return "16:9";
    const target = pixels.width / pixels.height;
    return videoRatioOptions
        .filter((item) => item.value !== "auto")
        .reduce((best, item) => {
            const current = item.width / item.height;
            const bestOption = videoRatioOptions.find((option) => option.value === best);
            const bestRatio = (bestOption?.width || 16) / (bestOption?.height || 9);
            return Math.abs(current - target) < Math.abs(bestRatio - target) ? item.value : best;
        }, "16:9");
}

export function computeVideoSize(resolution: string, ratio: string) {
    if (ratio === "auto" || !ratio) return "auto";
    const parsed = parseAspectRatio(ratio);
    if (!parsed) return "auto";
    const p = Math.max(1, Math.floor(Number(parseVideoResolution(resolution)) || 720));
    const landscape = parsed.width >= parsed.height;
    const width = evenRound(landscape ? (p * parsed.width) / parsed.height : p);
    const height = evenRound(landscape ? p : (p * parsed.height) / parsed.width);
    return `${width}x${height}`;
}

export function readVideoDimensions(size: string, resolution: string, ratio: string) {
    const pixels = parsePixelSize(size);
    if (pixels) return pixels;
    const computed = computeVideoSize(resolution, ratio === "auto" ? "16:9" : ratio);
    return parsePixelSize(computed) || { width: 0, height: 0 };
}

function evenRound(value: number) {
    return Math.max(2, Math.round(value / 2) * 2);
}
