import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { desktopProxyUrl } from "@/lib/desktop-network";

export type ApiCallFormat = "openai" | "gemini" | "sand" | "autodl" | "routerapi";
export type ModelCapability = "image" | "video" | "text" | "audio";
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "xhigh";

export type ChannelModel = {
    name: string;
    capability: ModelCapability;
    label?: string;
};

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: ChannelModel[];
    fixed?: boolean;
    presetVersion?: number;
    apiKeyUrl?: string;
};

export type AiConfig = {
    autoPairQuotesEnabled?: boolean;
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoMode: string;
    systemPrompt: string;
    reasoningEffort: ReasoningEffort;
    models: string[];
    quality: string;
    size: string;
    imageResolution?: string;
    background: string;
    count: string;
    canvasImageCount: string;
    proxyEnabled: boolean;
    proxyUrl: string;
    autoFocusOnSelect: boolean;
};

export type WebdavSyncConfig = {
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};
export type ConfigTabKey = "channels" | "local-proxy" | "preferences" | "webdav" | "local-storage";

export type ChannelCredentialsImportResult = {
    status: "created" | "updated" | "missing-base-url" | "invalid-base-url";
    channelName?: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const SAND_BASE_URL = "https://api.sand.ai";
const AUTODL_BASE_URL = "https://autodl.art";
const ROUTERAPI_BASE_URL = "https://routerapi.net";
const YINGMAN_BASE_URL = "https://yingman.xlapis.com";
export const LOCAL_PROXY_PACKAGE = "@basketikun/canvas-proxy";
export const DEFAULT_LOCAL_PROXY_URL = "http://127.0.0.1:23210";

export const FIXED_CHANNELS: ModelChannel[] = [
    {
        id: "fixed-magi-2",
        name: "MAGI-2",
        baseUrl: SAND_BASE_URL,
        apiKey: "",
        apiFormat: "sand",
        fixed: true,
        apiKeyUrl: "https://platform.sand.ai/app/keys/",
        models: [{ name: "magi-2", capability: "video" }],
    },
    {
        id: "fixed-autodl-h3",
        name: "Auto DL-H3",
        baseUrl: AUTODL_BASE_URL,
        apiKey: "",
        apiFormat: "autodl",
        fixed: true,
        presetVersion: 2,
        apiKeyUrl: "https://autodl.art/large-model/tokens",
        models: [
            { name: "minimax_h3_adl_int8", capability: "video" },
            { name: "minimax_h3_zm_u24", capability: "video" },
            { name: "minimax_h3_image_audio_to_video_v2_15s", capability: "video" },
            { name: "minimax_h3_zm_u30", capability: "video" },
            { name: "minimax_h3_zm_nono", capability: "video" },
            { name: "minimax_h3_lightx2v_v5_15s", capability: "video" },
            { name: "minimax_h3_lightx2v_no_pic", capability: "video" },
            { name: "minimax_h3_803", capability: "video" },
            { name: "minimax_h3_lightx2v", capability: "video" },
            { name: "minimax_h3_lightx2v_v5", capability: "video" },
            { name: "minimax_h3_image_audio_to_video_v2", capability: "video" },
            { name: "minimax_h3_801", capability: "video" },
            { name: "minimax_h3_zm_u08", capability: "video" },
            { name: "wan2.2animate-v4-motion_retargeting", capability: "video" },
            { name: "minimax_h3_805", capability: "video" },
            { name: "minimax_h3_802", capability: "video" },
            { name: "minimax_h3_zm_u22", capability: "video" },
            { name: "minimax_h3_804", capability: "video" },
            { name: "minimax_h3_zm_titi", capability: "video" },
            { name: "minimax_h3_image_audio_to_video", capability: "video" },
            { name: "minimax_h3_z0902", capability: "video" },
            { name: "minimax_h3_zm_titim", capability: "video" },
            { name: "minimax_h3_b99_002", capability: "video" },
            { name: "minimax_h3_z0901", capability: "video" },
            { name: "minimax_h3_z0903", capability: "video" },
            { name: "minimax_h3_b99_003_12s", capability: "video" },
            { name: "minimax_h3_b99_001", capability: "video" },
            { name: "indextts2-v1", capability: "audio" },
        ],
    },
    {
        id: "fixed-rou-sd25",
        name: "Rou-SD2.5",
        baseUrl: ROUTERAPI_BASE_URL,
        apiKey: "",
        apiFormat: "routerapi",
        fixed: true,
        apiKeyUrl: "https://routerapi.net/console/token",
        models: [
            { name: "seedance-2.0", capability: "video", label: "Seedance 2.0" },
            { name: "seedance-2.5", capability: "video", label: "Seedance 2.5" },
        ],
    },
    {
        id: "fixed-yingman-video",
        name: "萤漫Video",
        baseUrl: YINGMAN_BASE_URL,
        apiKey: "",
        apiFormat: "openai",
        fixed: true,
        apiKeyUrl: "https://yingman.xlapis.com/settings",
        models: [
            { name: "h3-video", capability: "video" },
            { name: "minimax-h3-rb", capability: "video" },
            { name: "h3-2k", capability: "video" },
            { name: "seedance-2.5-hlg", capability: "video" },
            { name: "seedance-2.5-special1", capability: "video" },
            { name: "seedance-2.5-pa-480p", capability: "video" },
            { name: "seedance-2.5-pa-720p", capability: "video" },
        ],
    },
];

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [
        { id: "default", name: "默认渠道", baseUrl: OPENAI_BASE_URL, apiKey: "", apiFormat: "openai", models: [] },
        ...FIXED_CHANNELS.map((channel) => ({ ...channel, models: channel.models.map((m) => ({ ...m })) })),
    ],
    model: "",
    imageModel: "",
    videoModel: "",
    textModel: "",
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoMode: "frames",
    systemPrompt: "",
    reasoningEffort: "auto",
    models: [],
    quality: "auto",
    size: "2048x2048",
    background: "",
    count: "1",
    canvasImageCount: "1",
    proxyEnabled: false,
    proxyUrl: DEFAULT_LOCAL_PROXY_URL,
    autoFocusOnSelect: false,
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    importChannelCredentials: (input: { baseUrl?: string | null; apiKey?: string | null }) => ChannelCredentialsImportResult;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

const VIDEO_KEYWORDS = ["video", "sora", "veo", "kling", "wan", "hailuo", "magi", "minimax_h3", "minimax-h3", "h3-", "animate", "seedance"];

export function boolConfig(value: string, fallback: boolean) {
    return value ? value === "true" : fallback;
}
const AUDIO_KEYWORDS = ["audio", "tts", "speech", "voice", "music", "sound", "indextts"];
const IMAGE_KEYWORDS = ["banana", "sunburst", "seedream", "gpt-image", "image", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney"];

/** Best-effort default capability for a freshly fetched model name; user can override in the channel editor. */
export function guessCapability(name: string): ModelCapability {
    const value = name.toLowerCase();
    if (VIDEO_KEYWORDS.some((keyword) => value.includes(keyword))) return "video";
    if (AUDIO_KEYWORDS.some((keyword) => value.includes(keyword))) return "audio";
    if (IMAGE_KEYWORDS.some((keyword) => value.includes(keyword))) return "image";
    return "text";
}

function findChannelModel(config: AiConfig, value: string): { channel: ModelChannel; model: ChannelModel } | null {
    const decoded = decodeChannelModel(value);
    const name = decoded?.model || value;
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : config.channels.find((item) => item.models.some((model) => model.name === name));
    const model = channel?.models.find((item) => item.name === name);
    return channel && model ? { channel, model } : null;
}

export function modelCapabilityOf(config: AiConfig, value: string): ModelCapability | undefined {
    return findChannelModel(config, value)?.model.capability;
}

export function modelMatchesCapability(config: AiConfig, value: string, capability?: ModelCapability) {
    if (!capability) return true;
    return modelCapabilityOf(config, value) === capability;
}

export function resolveModelForCapability(config: AiConfig, currentModel: string | undefined, capability: ModelCapability) {
    const defaultModel = capability === "image" ? config.imageModel : capability === "video" ? config.videoModel : capability === "audio" ? config.audioModel : config.textModel;
    const fallbackModel = capability === "image" ? defaultConfig.imageModel : capability === "video" ? defaultConfig.videoModel : capability === "audio" ? defaultConfig.audioModel : defaultConfig.textModel;
    for (const model of [currentModel, defaultModel]) {
        if (!model) continue;
        const configuredCapability = modelCapabilityOf(config, model);
        // Keep unavailable selections visible so the readiness check blocks the
        // request. Only a known capability switch may choose another model.
        if (!configuredCapability || configuredCapability === capability) return model;
    }
    return fallbackModel;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config.channels.flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => encodeChannelModel(channel.id, model.name)));
}

function isAiConfigReady(config: AiConfig, model: string) {
    const match = findChannelModel(config, model);
    return Boolean(match && match.channel.baseUrl.trim() && match.channel.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            importChannelCredentials: (input) => {
                const currentConfig = get().config;
                const result = upsertChannelCredentials(currentConfig, input);
                if (result.config !== currentConfig) set({ config: result.config });
                return { status: result.status, channelName: result.channelName };
            },
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => set({ isConfigOpen: true, shouldPromptContinue, configTab }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        imageModel: normalizeModelOptionValue(config.imageModel || config.model, channels),
                        videoModel: normalizeModelOptionValue(config.videoModel, channels),
                        textModel: normalizeModelOptionValue(config.textModel || config.model, channels),
                        audioModel: normalizeModelOptionValue(config.audioModel || defaultConfig.audioModel, channels),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        reasoningEffort: config.reasoningEffort || "auto",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        videoMode: config.videoMode === "reference" ? "reference" : "frames",
                        canvasImageCount: config.canvasImageCount || defaultConfig.canvasImageCount,
                        proxyEnabled: Boolean(config.proxyEnabled),
                        proxyUrl: config.proxyUrl || DEFAULT_LOCAL_PROXY_URL,
                        autoFocusOnSelect: Boolean(config.autoFocusOnSelect),
                    },
                };
            },
        },
    ),
);

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
    minimax_h3_adl_int8: "H3极速生视频(质量高并发高)",
    minimax_h3_lightx2v_no_pic: "H3文生视频",
    minimax_h3_lightx2v: "H3首尾帧生成视频",
    minimax_h3_lightx2v_v5: "H3多图参考生视频",
    minimax_h3_lightx2v_v5_15s: "H3多图生视频15秒",
    minimax_h3_image_audio_to_video: "H3图生视频-音频同步(自动对口型)",
    minimax_h3_image_audio_to_video_v2: "H3多图多音频生视频",
    minimax_h3_image_audio_to_video_v2_15s: "H3多图多音频生视频15秒",
    minimax_h3_z0901: "H3文生视频（高质量创意直出）",
    minimax_h3_z0902: "H3六图生视频（多图一致性创作）",
    minimax_h3_z0903: "H3六图三音频生视频（高质量音画融合）",
    minimax_h3_801: "H3九图15s(无字幕版)",
    minimax_h3_802: "H3九图15s(画质增强版)",
    minimax_h3_803: "H3九图三音15s(画质增强版)",
    minimax_h3_804: "H3九图15s(多模式版)",
    minimax_h3_805: "H3九图三音15s(多模式版)",
    minimax_h3_b99_001: "H3文生视频（736p）",
    minimax_h3_b99_002: "H3首尾帧生成视频（736p）",
    minimax_h3_b99_003_12s: "H3多图生视频12秒",
    minimax_h3_zm_nono: "H3多图多音频生视频(影视画质)",
    minimax_h3_zm_u08: "H3多图多音频生视频(高速版)",
    minimax_h3_zm_u22: "H3多图多音频生视频(短剧带货版)",
    minimax_h3_zm_u24: "H3多图多音频生视频(升级画质)",
    minimax_h3_zm_u30: "H3多图多音频生视频(超清画质)",
    minimax_h3_zm_titi: "H3全自动角色动迁替换",
    minimax_h3_zm_titim: "H3全自动多角色动迁替换",
    "wan2.2animate-v4-motion_retargeting": "动作迁移",
    "indextts2-v1": "IndexTTS2 语音合成",
    "seedance-2.0": "Seedance 2.0",
    "seedance-2.5": "Seedance 2.5",
    "h3-video": "H3 视频生成（按秒）",
    "minimax-h3-rb": "H3 首尾帧·音频参考（按次）",
    "h3-2k": "H3 2K 超清视频（按次）",
    "seedance-2.5-hlg": "Seedance 2.5 720P 多模态（按次）",
    "seedance-2.5-special1": "Seedance 2.5 720P 专线（按次）",
    "seedance-2.5-pa-480p": "Seedance 2.5 480P（按秒）",
    "seedance-2.5-pa-720p": "Seedance 2.5 720P（按秒）",
};

export function modelDisplayName(name: string, label?: string) {
    const raw = (name || "").trim();
    return label?.trim() || MODEL_DISPLAY_NAMES[raw] || raw;
}

/** Normalize a mixed list of raw model names or model objects into deduped ChannelModel entries. */
export function normalizeChannelModels(models: Array<string | ChannelModel> | undefined): ChannelModel[] {
    const seen = new Set<string>();
    const result: ChannelModel[] = [];
    for (const item of models || []) {
        const name = (typeof item === "string" ? item : item?.name || "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const capability = typeof item === "string" ? guessCapability(name) : item.capability || guessCapability(name);
        const label = typeof item === "string" ? undefined : item.label?.trim() || undefined;
        result.push(label ? { name, capability, label } : { name, capability });
    }
    return result;
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || i18n.t("config.channels.newName"),
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        apiFormat,
        models: normalizeChannelModels(channel?.models),
        ...(channel?.fixed ? { fixed: true } : {}),
        ...(channel?.presetVersion ? { presetVersion: channel.presetVersion } : {}),
        ...(channel?.apiKeyUrl ? { apiKeyUrl: channel.apiKeyUrl } : {}),
    };
}

export function upsertChannelCredentials(
    config: AiConfig,
    input: { baseUrl?: string | null; apiKey?: string | null },
): ChannelCredentialsImportResult & { config: AiConfig } {
    const rawBaseUrl = input.baseUrl?.trim() || "";
    if (!rawBaseUrl) return { status: "missing-base-url", config };
    if (!isHttpBaseUrl(rawBaseUrl)) return { status: "invalid-base-url", config };

    const baseUrl = normalizeImportedBaseUrl(rawBaseUrl);
    const apiKey = input.apiKey?.trim() || "";
    const matchingIndex = config.channels.findIndex((channel) => normalizedBaseUrlKey(channel.baseUrl) === normalizedBaseUrlKey(baseUrl));

    if (matchingIndex >= 0) {
        const existing = config.channels[matchingIndex];
        if (existing.baseUrl === baseUrl && (!apiKey || existing.apiKey === apiKey)) {
            return { status: "updated", channelName: existing.name, config };
        }
        const updated = { ...existing, baseUrl, ...(apiKey ? { apiKey } : {}) };
        const channels = config.channels.map((channel, index) => (index === matchingIndex ? updated : channel));
        return { status: "updated", channelName: existing.name, config: { ...config, channels } };
    }

    const channel = createModelChannel({
        name: importedChannelName(baseUrl),
        baseUrl,
        apiKey,
        apiFormat: "openai",
        models: [],
    });
    return { status: "created", channelName: channel.name, config: { ...config, channels: [...config.channels, channel] } };
}

function isHttpBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
    } catch {
        return false;
    }
}

function normalizedBaseUrlKey(baseUrl: string) {
    try {
        return stripTrailingApiVersion(normalizeImportedBaseUrl(baseUrl));
    } catch {
        return stripTrailingApiVersion(baseUrl.trim().replace(/\/+$/, ""));
    }
}

function normalizeImportedBaseUrl(baseUrl: string) {
    const url = new URL(baseUrl.trim());
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
}

function stripTrailingApiVersion(baseUrl: string) {
    return baseUrl.replace(/\/v1$/i, "");
}

function importedChannelName(baseUrl: string) {
    const hostname = new URL(baseUrl).hostname;
    return hostname.replace(/^(?:www|api)\./i, "") || i18n.t("config.channels.newName");
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionDisplayName(config: AiConfig, value: string) {
    const rawName = modelOptionName(value);
    const matched = findChannelModel(config, value);
    return modelDisplayName(rawName, matched?.model.label);
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return modelDisplayName(value);
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    const channelModel = channel?.models.find((item) => item.name === decoded.model);
    const display = modelDisplayName(decoded.model, channelModel?.label);
    return channel ? `${display}（${channel.name}）` : display;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model.name))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.some((item) => item.name === decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.some((entry) => entry.name === model)) || channels[0];
    return channel && channel.models.some((item) => item.name === model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.some((item) => item.name === model));
    if (!matched || !matched.models.some((item) => item.name === model)) throw new Error("所选模型或渠道不存在，请重新选择；不会改用其他渠道的密钥");
    if (!matched.apiKey.trim()) throw new Error(`请填写“${matched.name}”的独立 API Key；不会使用其他渠道的密钥`);
    return matched;
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const fixedById = new Map(FIXED_CHANNELS.map((item) => [item.id, item]));
    const channels = persistedChannels.map((channel, index) => {
        const fixedTemplate = channel.id ? fixedById.get(channel.id) : undefined;
        const needsPresetSync = Boolean(fixedTemplate?.presetVersion && (channel.presetVersion || 0) < fixedTemplate.presetVersion);
        const mergedModels = needsPresetSync && fixedTemplate
            ? normalizeChannelModels([...(channel.models || []), ...fixedTemplate.models])
            : normalizeChannelModels(channel.models);
        return createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || fixedTemplate?.name || (index === 0 ? i18n.t("config.channels.defaultName") : i18n.t("config.channels.indexedName", { index: index + 1 })),
            apiFormat: channel.apiFormat || fixedTemplate?.apiFormat,
            baseUrl: channel.baseUrl || fixedTemplate?.baseUrl,
            models: mergedModels,
            fixed: Boolean(fixedTemplate || channel.fixed),
            presetVersion: fixedTemplate?.presetVersion ?? channel.presetVersion,
            apiKeyUrl: fixedTemplate?.apiKeyUrl || channel.apiKeyUrl,
        });
    });
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: i18n.t("config.channels.defaultName"),
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: normalizeChannelModels([config.model, config.imageModel, config.videoModel, config.textModel, config.audioModel].map(modelOptionName)),
            }),
        );
    }
    for (const fixed of FIXED_CHANNELS) {
        if (!channels.some((channel) => channel.id === fixed.id)) {
            channels.push(createModelChannel({ ...fixed, models: fixed.models.map((m) => ({ ...m })) }));
        }
    }
    return channels;
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    if (apiFormat === "gemini") return GEMINI_BASE_URL;
    if (apiFormat === "sand") return SAND_BASE_URL;
    if (apiFormat === "autodl") return AUTODL_BASE_URL;
    if (apiFormat === "routerapi") return ROUTERAPI_BASE_URL;
    return OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    if (apiFormat === "gemini" || apiFormat === "sand" || apiFormat === "autodl" || apiFormat === "routerapi") return apiFormat;
    return "openai";
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return withLocalProxy(`${apiBaseUrl}${path}`);
}

export function normalizeLocalProxyUrl(value: string) {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** Prefix an outgoing request with the local forwarding proxy so the browser is not blocked by CORS. */
export function withLocalProxy(url: string) {
    const desktop = desktopProxyUrl();
    if (desktop && /^https?:\/\//i.test(url)) return url.startsWith(`${desktop}/`) ? url : `${desktop}/${url}`;
    const { proxyEnabled, proxyUrl } = useConfigStore.getState().config;
    if (!proxyEnabled || !/^https?:\/\//i.test(url)) return url;
    const base = normalizeLocalProxyUrl(proxyUrl);
    if (!base || url.startsWith(`${base}/`)) return url;
    return `${base}/${url}`;
}
