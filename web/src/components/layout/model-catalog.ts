import type { ChannelModel, ModelCapability } from "@/stores/use-config-store";

export const modelCapabilityOptions: Array<{ label: string; value: ModelCapability | "all" }> = [
    { label: "全部", value: "all" },
    { label: "Chat", value: "text" },
    { label: "Image", value: "image" },
    { label: "Video", value: "video" },
    { label: "Music", value: "audio" },
];

export function groupModelFamilies(models: ChannelModel[]) {
    const groups = new Map<string, ChannelModel[]>();
    for (const model of models) {
        const name = model.name.split("/").pop() || model.name;
        const family = /nano[-_ ]?banana/i.test(name) ? "Nano Banana"
            : model.capability === "image" && /^(?:gemini|imagen)/i.test(name) ? "Gemini Image"
            : model.capability === "image" && /^(?:gpt|dall-e)/i.test(name) ? "OpenAI Image / DALL·E"
            : model.capability === "image" && /grok/i.test(name) ? "Grok Image"
            : /^(?:gpt|chatgpt|o\d|dall-e)/i.test(name) ? "OpenAI"
            : /^(?:gemini|imagen|veo)/i.test(name) ? "Google"
            : /claude/i.test(name) ? "Claude"
            : /deepseek/i.test(name) ? "DeepSeek"
            : /qwen|qwq/i.test(name) ? "Qwen"
            : /flux/i.test(name) ? "FLUX"
            : /seedream|doubao/i.test(name) ? "豆包"
            : /sora/i.test(name) ? "Sora"
            : /kling/i.test(name) ? "Kling"
            : /suno/i.test(name) ? "Suno"
            : name.split(/[-_.:]/)[0] || "其他";
        groups.set(family, [...(groups.get(family) || []), model]);
    }
    return Array.from(groups, ([family, entries]) => ({ family, models: entries }));
}
