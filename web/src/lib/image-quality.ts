import { modelOptionName } from "@/stores/use-config-store";

// Match the model ID, including channel-encoded relay aliases, never the channel URL.
export function imageQualityOptions(model: string): string[] {
    const name = modelOptionName(model).toLowerCase().replace(/^models\//, "");
    if (/^gpt-image-2\.[56]-(sunburst|flare)(?:-|$)/.test(name)) return ["auto", "low", "medium", "high", "xhigh", "max"];
    if (/^gpt-image-(?:1(?:\.5)?(?:-mini)?|2(?:\.[56])?)(?:-|$)/.test(name)) return ["auto", "low", "medium", "high"];
    return [];
}

export function imageQualityForModel(model: string, quality: string | undefined): string {
    const value = quality?.trim().toLowerCase() || "auto";
    return imageQualityOptions(model).includes(value) ? value : "auto";
}

export function imageRequestQuality(model: string, quality: string): string | undefined {
    const options = imageQualityOptions(model), value = quality.trim().toLowerCase();
    if (!options.length || !value || value === "auto") return undefined;
    if (!options.includes(value)) throw new Error(`${modelOptionName(model)} 不支持质量 ${value}，请重新选择质量`);
    return value;
}