import axios from "axios";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { dataUrlToFile, readFileAsDataUrl } from "@/lib/image-utils";
import { inferVideoRatio, parseVideoResolution } from "@/lib/media-size";
import { getMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import {
    boolConfig,
    buildApiUrl,
    guessCapability,
    modelOptionName,
    withLocalProxy,
    type AiConfig,
    type ChannelModel,
    type ModelCapability,
    type ModelChannel,
} from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);
const MODEL_LIST_TIMEOUT_MS = 15000;
const SAND_VALID_RATIOS = new Set(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);

export type RelayVerification = {
    reachable: boolean;
    status: number;
    authenticated: boolean;
    modelCount: number;
    detail: string;
};

export type RelayVideoTaskResult = { blob?: Blob; url?: string; mimeType?: string };
export type RelayVideoTaskState =
    | { status: "pending" }
    | { status: "completed"; result: RelayVideoTaskResult }
    | { status: "failed"; error: string };

type RequestOptions = { signal?: AbortSignal };
type VideoMediaOptions = RequestOptions & { videos?: ReferenceVideo[]; audios?: ReferenceAudio[] };

type AutoDLInputRule = {
    type?: string;
    required?: boolean;
    default?: unknown;
    min?: number;
    max?: number;
    options?: string[];
    accept_types?: string[];
};

const autodlRulesCache = new Map<string, Record<string, AutoDLInputRule>>();

/* ==========================================================================
 *  1. Sand AI (MAGI-2) — https://platform.sand.ai/docs/get-started/
 *     - Native v2: POST /v2/generations, GET /v2/generations/{id}
 *     - Assets:    POST /v1/assets (multipart/form-data, lossless int64 id)
 *     - Ark v3:    POST /compatible/ark/api/v3/contents/generations/tasks (supports first_frame / last_frame)
 * ========================================================================== */

function stripSlashes(url: string) {
    return url.trim().replace(/\/+$/, "");
}

function isSandArkBaseUrl(baseUrl: string) {
    return /\/compatible\/ark\/api\/v3$/i.test(stripSlashes(baseUrl));
}

function sandRootBaseUrl(baseUrl: string) {
    return stripSlashes(baseUrl)
        .replace(/\/compatible\/ark\/api\/v3$/i, "")
        .replace(/\/v[12]$/i, "");
}

function sandArkBaseUrl(baseUrl: string) {
    const clean = stripSlashes(baseUrl);
    return isSandArkBaseUrl(clean) ? clean : `${sandRootBaseUrl(clean)}/compatible/ark/api/v3`;
}

function sandHeaders(apiKey: string, contentType?: string) {
    return {
        Authorization: `Bearer ${apiKey.trim()}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function clampSandDuration(raw: string | undefined) {
    const parsed = Math.round(Number(raw) || 5);
    return Math.max(4, Math.min(30, parsed));
}

function resolveSandRatio(size: string | undefined) {
    const inferred = inferVideoRatio(size || "16:9");
    if (inferred === "auto" || !SAND_VALID_RATIOS.has(inferred)) return "16:9";
    return inferred;
}

/** Lossless int64 ID extraction from Sand AI JSON response (avoids JS Number > 2^53 precision loss). */
function extractLosslessSandId(raw: unknown): string {
    if (typeof raw === "string") {
        const match = raw.match(/"id"\s*:\s*"?(\d+)"?/);
        if (match?.[1]) return match[1];
        try {
            const parsed = JSON.parse(raw) as { id?: string | number };
            if (parsed?.id !== undefined && parsed?.id !== null) return String(parsed.id);
        } catch {
            // fall through
        }
        return "";
    }
    if (raw && typeof raw === "object" && "id" in raw) {
        const value = (raw as { id?: string | number }).id;
        return value !== undefined && value !== null ? String(value) : "";
    }
    return "";
}

async function uploadSandAsset(config: Pick<AiConfig, "baseUrl" | "apiKey">, file: File, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append("file", file, file.name || "asset.bin");
    const response = await axios.post<string>(withLocalProxy(`${sandRootBaseUrl(config.baseUrl)}/v1/assets`), form, {
        headers: sandHeaders(config.apiKey),
        responseType: "text",
        transformResponse: [(data) => data],
        signal,
    });
    const assetId = extractLosslessSandId(response.data);
    if (!assetId) throw new Error("Sand AI 素材上传成功但未返回有效的资产 ID");
    return assetId;
}

export async function createSandVideoTask(
    config: AiConfig,
    model: string,
    prompt: string,
    references: ReferenceImage[],
    options?: VideoMediaOptions,
): Promise<{ id: string; provider: "sand"; model: string }> {
    const modelName = modelOptionName(model) || "magi-2";
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const frameMode = config.videoMode !== "reference" && references.length > 0 && references.length <= 2 && !videos.length && !audios.length;
    const useArk = isSandArkBaseUrl(config.baseUrl) || frameMode;
    const duration = clampSandDuration(config.videoSeconds);
    const ratio = resolveSandRatio(config.size);
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const trimmedPrompt = prompt.trim();

    try {
        if (useArk) {
            const content: Array<Record<string, unknown>> = [];
            if (trimmedPrompt) content.push({ type: "text", text: trimmedPrompt });

            const imageUrls = await Promise.all(
                references.slice(0, 10).map(async (image) => {
                    const dataUrl = await imageToDataUrl(image);
                    if (isSandArkBaseUrl(config.baseUrl)) return dataUrl;
                    try {
                        const file = await dataUrlToFile({ ...image, dataUrl });
                        const id = await uploadSandAsset(config, file, options?.signal);
                        return `asset://${id}`;
                    } catch {
                        return dataUrl;
                    }
                }),
            );

            if (frameMode) {
                if (imageUrls[0]) content.push({ type: "image_url", role: "first_frame", image_url: { url: imageUrls[0] } });
                if (imageUrls[1]) content.push({ type: "image_url", role: "last_frame", image_url: { url: imageUrls[1] } });
            } else {
                imageUrls.forEach((url) => content.push({ type: "image_url", role: "reference_image", image_url: { url } }));
                for (const videoFile of videos.slice(0, 5)) {
                    const id = await uploadSandAsset(config, videoFile, options?.signal);
                    content.push({ type: "video_url", role: "reference_video", video_url: { url: `asset://${id}` } });
                }
                for (const audioFile of audios.slice(0, 5)) {
                    const id = await uploadSandAsset(config, audioFile, options?.signal);
                    content.push({ type: "audio_url", role: "reference_audio", audio_url: { url: `asset://${id}` } });
                }
            }

            if (!content.length) throw new Error("请输入提示词或提供参考素材");

            const response = await axios.post<string>(
                withLocalProxy(`${sandArkBaseUrl(config.baseUrl)}/contents/generations/tasks`),
                {
                    model: modelName,
                    content,
                    duration,
                    ratio,
                    resolution: "1080p",
                    generate_audio: generateAudio,
                },
                {
                    headers: sandHeaders(config.apiKey, "application/json"),
                    responseType: "text",
                    transformResponse: [(data) => data],
                    signal: options?.signal,
                },
            );
            const taskId = extractLosslessSandId(response.data);
            if (!taskId) throw new Error(apiText("noVideoTaskId"));
            return { id: `ark:${taskId}`, provider: "sand", model };
        }

        // Sand AI Native v2 API: POST /v2/generations
        const parts: Array<Record<string, unknown>> = [];
        parts.push({ type: "text", text: trimmedPrompt || "Smooth cinematic motion." });

        for (const image of references.slice(0, 10)) {
            const dataUrl = await imageToDataUrl(image);
            const file = await dataUrlToFile({ ...image, dataUrl });
            const assetId = await uploadSandAsset(config, file, options?.signal);
            parts.push({ type: "reference_image", image: { assetId } });
        }
        for (const videoFile of videos.slice(0, 5)) {
            const assetId = await uploadSandAsset(config, videoFile, options?.signal);
            parts.push({ type: "reference_video", video: { assetId } });
        }
        for (const audioFile of audios.slice(0, 5)) {
            const assetId = await uploadSandAsset(config, audioFile, options?.signal);
            parts.push({ type: "reference_audio", audio: { assetId } });
        }

        const response = await axios.post<string>(
            withLocalProxy(`${sandRootBaseUrl(config.baseUrl)}/v2/generations`),
            {
                model: modelName,
                parts,
                duration,
                aspectRatio: ratio,
                resolution: "1080p",
                generateAudio,
            },
            {
                headers: sandHeaders(config.apiKey, "application/json"),
                responseType: "text",
                transformResponse: [(data) => data],
                signal: options?.signal,
            },
        );
        const taskId = extractLosslessSandId(response.data);
        if (!taskId) throw new Error(apiText("noVideoTaskId"));
        return { id: taskId, provider: "sand", model };
    } catch (error) {
        throw new Error(readRelayError(error, apiText("videoTaskCreateFailed")));
    }
}

export async function pollSandVideoTask(
    config: AiConfig,
    taskId: string,
    options?: RequestOptions,
): Promise<RelayVideoTaskState> {
    const isArk = taskId.startsWith("ark:");
    const rawId = isArk ? taskId.slice(4) : taskId;
    const url = isArk
        ? withLocalProxy(`${sandArkBaseUrl(config.baseUrl)}/contents/generations/tasks/${encodeURIComponent(rawId)}`)
        : withLocalProxy(`${sandRootBaseUrl(config.baseUrl)}/v2/generations/${encodeURIComponent(rawId)}`);

    try {
        const response = await axios.get<{
            status?: string;
            output?: { videoUrl?: string | null } | null;
            content?: { video_url?: string | null } | null;
            error?: { code?: string; message?: string } | null;
        }>(url, { headers: sandHeaders(config.apiKey), signal: options?.signal });
        const data = response.data || {};
        const status = String(data.status || "").toLowerCase();
        if (status === "succeeded") {
            const videoUrl = data.output?.videoUrl || data.content?.video_url;
            if (!videoUrl) return { status: "failed", error: apiText("noPlayableVideo") };
            return { status: "completed", result: await downloadMediaResult(videoUrl, "video/mp4", options) };
        }
        if (status === "failed" || status === "canceled" || status === "cancelled" || status === "expired") {
            return { status: "failed", error: data.error?.message || data.error?.code || apiText("videoGenerationFailed") };
        }
        return { status: "pending" };
    } catch (error) {
        throw new Error(readRelayError(error, apiText("videoTaskQueryFailed")));
    }
}

export async function verifySandChannel(channel: Pick<ModelChannel, "baseUrl" | "apiKey">): Promise<RelayVerification> {
    const key = channel.apiKey.trim();
    if (!key) return { reachable: false, status: 0, authenticated: false, modelCount: 0, detail: "请先填写 Sand AI API Key" };
    const probeUrl = isSandArkBaseUrl(channel.baseUrl)
        ? withLocalProxy(`${sandArkBaseUrl(channel.baseUrl)}/contents/generations/tasks/0`)
        : withLocalProxy(`${sandRootBaseUrl(channel.baseUrl)}/v2/generations/0`);
    try {
        const response = await axios.get(probeUrl, {
            headers: sandHeaders(key),
            timeout: MODEL_LIST_TIMEOUT_MS,
            validateStatus: () => true,
        });
        const unauth = response.status === 401 || response.status === 403;
        const ok = !unauth && response.status >= 200 && response.status < 500;
        return {
            reachable: true,
            status: response.status,
            authenticated: ok,
            modelCount: ok ? 1 : 0,
            detail: ok ? "" : readRelayErrorData(response.data) || `HTTP ${response.status}`,
        };
    } catch (error) {
        return { reachable: false, status: 0, authenticated: false, modelCount: 0, detail: readRelayError(error, "网络错误") };
    }
}

export function fetchSandModels(channel?: Pick<ModelChannel, "models">): ChannelModel[] {
    const defaults: ChannelModel[] = [{ name: "magi-2", capability: "video" }];
    const map = new Map<string, ChannelModel>();
    defaults.forEach((m) => map.set(m.name, m));
    (channel?.models || []).forEach((m) => map.set(m.name, m));
    return Array.from(map.values());
}

/* ==========================================================================
 *  2. AutoDL.art ComfyUI API (Auto DL-H3) — https://autodl.art/docs/comfyui_api/
 *     - Auth:      Authorization: <raw ComfyUI group token> (no Bearer prefix)
 *     - List:      POST /api/v1/comfyui/workflows { page_index, page_size }
 *     - Describe:  GET  /api/v1/comfyui/workflows/{workflow_id}
 *     - Submit:    POST /api/v1/comfyui/comfyui_workflow/{workflow_id}
 *     - Poll:      GET  /api/v1/comfyui/comfyui_workflow/result/{task_id}
 * ========================================================================== */

function autodlRootBaseUrl(baseUrl: string) {
    return stripSlashes(baseUrl).replace(/\/api\/v1\/comfyui(?:\/.*)?$/i, "");
}

function autodlToken(apiKey: string) {
    return apiKey.trim().replace(/^Bearer\s+/i, "");
}

function autodlHeaders(apiKey: string, json = true) {
    return {
        Authorization: autodlToken(apiKey),
        Accept: "application/json",
        ...(json ? { "Content-Type": "application/json" } : {}),
    };
}

function unwrapAutoDLPayload<T>(payload: { code?: string; msg?: string; message?: string; data?: T } | undefined, fallback: string): T {
    if (!payload || typeof payload !== "object") throw new Error(fallback);
    if (payload.code && payload.code !== "Success") {
        throw new Error(payload.msg || payload.message || `${fallback}（${payload.code}）`);
    }
    if (payload.data === undefined || payload.data === null) throw new Error(fallback);
    return payload.data;
}

function inferAutoDLCapability(uuid: string, name?: string): ModelCapability {
    const lower = `${uuid} ${name || ""}`.toLowerCase();
    if (/tts|audio|music|voice|语音|音频/.test(lower) && !/to_video|生视频|video/.test(lower)) return "audio";
    if (/video|h3|wan|sora|kling|animate|动迁|对口型|视频/.test(lower)) return "video";
    if (/image|flux|sdxl|qwen.*image|z-image|文生图|图生图|生图/.test(lower)) return "image";
    return guessCapability(uuid);
}

export async function fetchAutoDLModels(channel: Pick<ModelChannel, "baseUrl" | "apiKey" | "models">): Promise<ChannelModel[]> {
    const root = autodlRootBaseUrl(channel.baseUrl);
    const headers = autodlHeaders(channel.apiKey);
    const items: Array<{ uuid?: string; name?: string }> = [];
    let page = 1;
    let maxPage = 1;
    try {
        while (page <= maxPage && page <= 20) {
            const response = await axios.post<{
                code?: string;
                msg?: string;
                data?: { list?: Array<{ uuid?: string; name?: string }>; max_page?: number; result_total?: number };
            }>(
                withLocalProxy(`${root}/api/v1/comfyui/workflows`),
                { page_index: page, page_size: 100 },
                { headers, timeout: MODEL_LIST_TIMEOUT_MS },
            );
            const data = unwrapAutoDLPayload(response.data, "读取 AutoDL 工作流列表失败");
            const list = Array.isArray(data.list) ? data.list : [];
            items.push(...list);
            maxPage = Math.max(1, Number(data.max_page) || 1);
            if (!list.length) break;
            page += 1;
        }
        const existing = new Map((channel.models || []).map((m) => [m.name, m]));
        const deduped = new Map<string, ChannelModel>();
        for (const item of items) {
            const id = item.uuid?.trim();
            if (!id) continue;
            const prev = existing.get(id);
            const label = prev?.label || item.name?.trim() || undefined;
            deduped.set(id, {
                name: id,
                capability: prev?.capability || inferAutoDLCapability(id, item.name),
                ...(label ? { label } : {}),
            });
        }
        return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        throw new Error(readRelayError(error, "读取 AutoDL 工作流列表失败"));
    }
}

export async function verifyAutoDLChannel(channel: Pick<ModelChannel, "baseUrl" | "apiKey">): Promise<RelayVerification> {
    const token = autodlToken(channel.apiKey);
    if (!token) return { reachable: false, status: 0, authenticated: false, modelCount: 0, detail: "请填写 AutoDL ComfyUI 分组 Token" };
    try {
        const response = await axios.post<{
            code?: string;
            msg?: string;
            data?: { list?: unknown[]; result_total?: number };
        }>(
            withLocalProxy(`${autodlRootBaseUrl(channel.baseUrl)}/api/v1/comfyui/workflows`),
            { page_index: 1, page_size: 20 },
            { headers: autodlHeaders(token), timeout: MODEL_LIST_TIMEOUT_MS, validateStatus: () => true },
        );
        const ok = response.status >= 200 && response.status < 300 && response.data?.code === "Success";
        const count = ok ? Number(response.data?.data?.result_total ?? response.data?.data?.list?.length ?? 0) : 0;
        return {
            reachable: true,
            status: response.status,
            authenticated: ok,
            modelCount: count,
            detail: ok ? "" : response.data?.msg || readRelayErrorData(response.data) || `HTTP ${response.status}`,
        };
    } catch (error) {
        return { reachable: false, status: 0, authenticated: false, modelCount: 0, detail: readRelayError(error, "网络错误") };
    }
}

async function fetchAutoDLWorkflowRules(
    config: Pick<AiConfig, "baseUrl" | "apiKey">,
    workflowId: string,
    signal?: AbortSignal,
): Promise<Record<string, AutoDLInputRule> | null> {
    const key = `${autodlRootBaseUrl(config.baseUrl)}::${workflowId}`;
    const cached = autodlRulesCache.get(key);
    if (cached) return cached;
    try {
        const response = await axios.get<{ code?: string; msg?: string; data?: { input_rules?: Record<string, AutoDLInputRule> } }>(
            withLocalProxy(`${autodlRootBaseUrl(config.baseUrl)}/api/v1/comfyui/workflows/${encodeURIComponent(workflowId)}`),
            { headers: autodlHeaders(config.apiKey, false), signal },
        );
        const data = unwrapAutoDLPayload(response.data, "读取工作流参数规则失败");
        if (data.input_rules && typeof data.input_rules === "object") {
            autodlRulesCache.set(key, data.input_rules);
            return data.input_rules;
        }
    } catch {
        // Fall back to standard H3 field conventions if describe endpoint is unavailable on a proxy.
    }
    return null;
}

function autodlSlotKind(rule: AutoDLInputRule): "image" | "audio" | "video" | null {
    if (rule.type === "image" || rule.type === "audio" || rule.type === "video") return rule.type;
    for (const mime of rule.accept_types || []) {
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("audio/")) return "audio";
        if (mime.startsWith("video/")) return "video";
    }
    return null;
}

function naturalCompare(a: string, b: string) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function detectOrientation(option: string): "landscape" | "portrait" | "square" | null {
    if (/横|landscape/i.test(option)) return "landscape";
    if (/竖|portrait/i.test(option)) return "portrait";
    if (/1:1|方|square/i.test(option)) return "square";
    const dims = option.match(/(\d{3,4})\s*[*xX×]\s*(\d{3,4})/);
    if (dims) {
        const w = Number(dims[1]);
        const h = Number(dims[2]);
        if (w === h) return "square";
        return w > h ? "landscape" : "portrait";
    }
    return null;
}

function detectResolutionTier(option: string): number {
    const pMatch = option.match(/(\d{3,4})\s*p/i);
    if (pMatch) return Number(pMatch[1]);
    const dims = option.match(/(\d{3,4})\s*[*xX×]\s*(\d{3,4})/);
    if (dims) return Math.min(Number(dims[1]), Number(dims[2]));
    return 768;
}

function pickAutoDLResolution(options: string[], vquality: string | undefined, size: string | undefined, fallback?: string): string | undefined {
    if (!options.length) return fallback;
    const ratio = inferVideoRatio(size || "16:9");
    const desiredOrientation: "landscape" | "portrait" | "square" =
        ratio === "1:1" ? "square" : ratio === "9:16" || ratio === "3:4" ? "portrait" : "landscape";
    const parsedQuality = Number(parseVideoResolution(vquality)) || 720;
    const desiredTier = parsedQuality >= 2000 ? 1440 : parsedQuality;

    let best = options[0];
    let bestScore = Infinity;
    for (const option of options) {
        const orient = detectOrientation(option);
        const tier = detectResolutionTier(option);
        const orientPenalty = orient === desiredOrientation ? 0 : orient === null ? 500 : 2000;
        const tierDiff = Math.abs(tier - desiredTier);
        const score = orientPenalty + tierDiff;
        if (score < bestScore) {
            bestScore = score;
            best = option;
        }
    }
    return best;
}

async function buildAutoDLBody(
    workflowId: string,
    rules: Record<string, AutoDLInputRule> | null,
    prompt: string,
    imageUrls: string[],
    videoUrls: string[],
    audioUrls: string[],
    config: AiConfig,
): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {};
    const trimmedPrompt = prompt.trim();

    if (rules && Object.keys(rules).length > 0) {
        const promptField = "prompt" in rules ? "prompt" : "prompt_text" in rules ? "prompt_text" : null;
        if (promptField && trimmedPrompt) {
            body[promptField] = trimmedPrompt;
        }

        const durationField = "duration" in rules ? "duration" : "audio_duration" in rules ? "audio_duration" : null;
        if (durationField) {
            const rule = rules[durationField];
            const raw = Math.round(Number(config.videoSeconds) || Number(rule.default) || 5);
            const min = typeof rule.min === "number" ? rule.min : 1;
            const max = typeof rule.max === "number" ? rule.max : 15;
            body[durationField] = Math.max(min, Math.min(max, raw));
        }

        if ("resolution" in rules) {
            const rule = rules.resolution;
            const picked = Array.isArray(rule.options) && rule.options.length
                ? pickAutoDLResolution(rule.options, config.vquality, config.size, typeof rule.default === "string" ? rule.default : undefined)
                : typeof rule.default === "string"
                  ? rule.default
                  : undefined;
            if (picked) body.resolution = picked;
        }

        const imageQueue = [...imageUrls];
        const videoQueue = [...videoUrls];
        const audioQueue = [...audioUrls];

        // Fill explicit first_frame / last_frame before numbered ref_image_* slots
        if ("first_frame" in rules && imageQueue.length) body.first_frame = imageQueue.shift();
        if ("last_frame" in rules && imageQueue.length) body.last_frame = imageQueue.shift();

        const sortedNames = Object.keys(rules).sort(naturalCompare);
        for (const name of sortedNames) {
            if (name in body) continue;
            const rule = rules[name];
            const kind = autodlSlotKind(rule);
            if (kind === "image" && imageQueue.length) {
                body[name] = imageQueue.shift();
            } else if (kind === "video" && videoQueue.length) {
                body[name] = videoQueue.shift();
            } else if (kind === "audio" && audioQueue.length) {
                body[name] = audioQueue.shift();
            } else if (kind === null && rule.required && rule.default !== undefined) {
                body[name] = rule.default;
            }
        }

        // Validate required inputs before sending a billable task
        for (const [name, rule] of Object.entries(rules)) {
            if (!rule.required) continue;
            const value = body[name];
            const missing = value === undefined || value === null || String(value).trim() === "";
            if (!missing) continue;
            const kind = autodlSlotKind(rule);
            if (name === "first_frame" || name === "last_frame") throw new Error(`工作流 ${workflowId} 需要提供首帧和尾帧参考图`);
            if (kind === "image") throw new Error(`工作流 ${workflowId} 缺少必填参考图（${name}）`);
            if (kind === "video") throw new Error(`工作流 ${workflowId} 缺少必填参考视频（${name}）`);
            if (kind === "audio") throw new Error(`工作流 ${workflowId} 缺少必填参考音频（${name}）`);
            if (name === "prompt" || name === "prompt_text") throw new Error(`工作流 ${workflowId} 需要填写提示词`);
        }
        return body;
    }

    // Fallback when workflow input_rules could not be fetched
    if (trimmedPrompt) body.prompt = trimmedPrompt;
    const rawDuration = Math.round(Number(config.videoSeconds) || 5);
    body.duration = Math.max(1, Math.min(15, rawDuration));
    const ratio = inferVideoRatio(config.size || "16:9");
    const tier = Number(parseVideoResolution(config.vquality)) >= 720 ? "768p" : "480p";
    const suffix = ratio === "9:16" || ratio === "3:4" ? "竖" : "横";
    body.resolution = `${tier}${suffix}`;
    if (config.videoMode !== "reference" && imageUrls.length === 2 && /lightx2v$|b99_002$/i.test(workflowId)) {
        body.first_frame = imageUrls[0];
        body.last_frame = imageUrls[1];
    } else {
        imageUrls.slice(0, 9).forEach((url, idx) => {
            body[`ref_image_${idx}`] = url;
        });
    }
    audioUrls.slice(0, 3).forEach((url, idx) => {
        body[`ref_audio_${idx}`] = url;
    });
    if (videoUrls[0]) body.ref_video = videoUrls[0];
    return body;
}

async function submitAutoDLWorkflow(
    config: AiConfig,
    workflowId: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<string> {
    const response = await axios.post<{
        code?: string;
        msg?: string;
        data?: { task_id?: string };
    }>(
        withLocalProxy(`${autodlRootBaseUrl(config.baseUrl)}/api/v1/comfyui/comfyui_workflow/${encodeURIComponent(workflowId)}`),
        body,
        { headers: autodlHeaders(config.apiKey), signal },
    );
    const data = unwrapAutoDLPayload(response.data, apiText("videoTaskCreateFailed"));
    if (!data.task_id) throw new Error(apiText("noVideoTaskId"));
    return data.task_id;
}

type AutoDLResultItem = { url?: string; type?: string; file_type?: string; output_type?: string };

async function queryAutoDLTask(
    config: Pick<AiConfig, "baseUrl" | "apiKey">,
    taskId: string,
    signal?: AbortSignal,
): Promise<{ status: "pending" } | { status: "completed"; results: AutoDLResultItem[] } | { status: "failed"; error: string }> {
    const response = await axios.get<{
        code?: string;
        msg?: string;
        data?: { status?: string; message?: string; results?: AutoDLResultItem[] };
    }>(
        withLocalProxy(`${autodlRootBaseUrl(config.baseUrl)}/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(taskId)}`),
        { headers: autodlHeaders(config.apiKey, false), signal },
    );
    const data = unwrapAutoDLPayload(response.data, apiText("videoTaskQueryFailed"));
    const status = String(data.status || "").trim().toUpperCase();
    if (status === "SUCCESS" || status === "COMPLETED" || status === "COMPLETE" || status === "DONE") {
        return { status: "completed", results: Array.isArray(data.results) ? data.results : [] };
    }
    if (status === "FAILED" || status === "FAILURE" || status === "FAIL" || status === "ERROR") {
        return { status: "failed", error: data.message || response.data?.msg || apiText("videoGenerationFailed") };
    }
    return { status: "pending" };
}

export async function createAutoDLVideoTask(
    config: AiConfig,
    model: string,
    prompt: string,
    references: ReferenceImage[],
    options?: VideoMediaOptions,
): Promise<{ id: string; provider: "autodl"; model: string }> {
    const workflowId = modelOptionName(model).trim();
    try {
        const [rules, imageUrls, videoUrls, audioUrls] = await Promise.all([
            fetchAutoDLWorkflowRules(config, workflowId, options?.signal),
            Promise.all(references.map((image) => imageToDataUrl(image))),
            Promise.all((options?.videos || []).map((video) => referenceMediaToDataUrl(video, "ref.mp4", "invalidReferenceVideo", options))),
            Promise.all((options?.audios || []).map((audio) => referenceMediaToDataUrl(audio, "ref.mp3", "invalidReferenceAudio", options))),
        ]);
        const body = await buildAutoDLBody(workflowId, rules, prompt, imageUrls, videoUrls, audioUrls, config);
        const taskId = await submitAutoDLWorkflow(config, workflowId, body, options?.signal);
        return { id: taskId, provider: "autodl", model };
    } catch (error) {
        throw new Error(readRelayError(error, apiText("videoTaskCreateFailed")));
    }
}

export async function pollAutoDLVideoTask(
    config: AiConfig,
    taskId: string,
    options?: RequestOptions,
): Promise<RelayVideoTaskState> {
    try {
        const state = await queryAutoDLTask(config, taskId, options?.signal);
        if (state.status === "pending" || state.status === "failed") return state;
        const preferred =
            state.results.find((item) => item.url && /video|mp4|webm|mov/i.test(`${item.type || ""} ${item.file_type || ""} ${item.url}`)) ||
            state.results.find((item) => Boolean(item.url));
        if (!preferred?.url) return { status: "failed", error: apiText("noPlayableVideo") };
        return { status: "completed", result: await downloadMediaResult(preferred.url, "video/mp4", options) };
    } catch (error) {
        throw new Error(readRelayError(error, apiText("videoTaskQueryFailed")));
    }
}

export async function requestAutoDLImages(
    config: AiConfig,
    prompt: string,
    references: ReferenceImage[] = [],
    options?: RequestOptions,
): Promise<Array<{ id: string; dataUrl: string }>> {
    const workflowId = modelOptionName(config.model || config.imageModel).trim();
    try {
        const [rules, imageUrls] = await Promise.all([
            fetchAutoDLWorkflowRules(config, workflowId, options?.signal),
            Promise.all(references.map((image) => imageToDataUrl(image))),
        ]);
        const body = await buildAutoDLBody(workflowId, rules, prompt, imageUrls, [], [], config);
        const taskId = await submitAutoDLWorkflow(config, workflowId, body, options?.signal);

        for (let attempt = 0; attempt < 120; attempt += 1) {
            if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const state = await queryAutoDLTask(config, taskId, options?.signal);
            if (state.status === "failed") throw new Error(state.error);
            if (state.status === "completed") {
                const urls = state.results.map((item) => item.url).filter((u): u is string => Boolean(u));
                if (!urls.length) throw new Error("AutoDL 工作流未返回图片结果");
                const downloaded = await Promise.all(
                    urls.map(async (url) => {
                        try {
                            const res = await axios.get<Blob>(withLocalProxy(url), { responseType: "blob", signal: options?.signal });
                            const dataUrl = await readFileAsDataUrl(new File([res.data], "autodl.png", { type: res.data.type || "image/png" }));
                            return { id: nanoid(), dataUrl };
                        } catch {
                            return { id: nanoid(), dataUrl: url };
                        }
                    }),
                );
                return downloaded;
            }
            if (attempt === 119) throw new Error("AutoDL 工作流执行超时");
            await delay(2500, options?.signal);
        }
        throw new Error("AutoDL 工作流执行超时");
    } catch (error) {
        throw new Error(readRelayError(error, apiText("requestFailed")));
    }
}

export async function requestAutoDLAudio(config: AiConfig, prompt: string, options?: RequestOptions): Promise<Blob> {
    const workflowId = modelOptionName(config.model || config.audioModel).trim();
    try {
        const rules = await fetchAutoDLWorkflowRules(config, workflowId, options?.signal);
        const body = await buildAutoDLBody(workflowId, rules, prompt, [], [], [], config);
        const taskId = await submitAutoDLWorkflow(config, workflowId, body, options?.signal);

        for (let attempt = 0; attempt < 120; attempt += 1) {
            if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const state = await queryAutoDLTask(config, taskId, options?.signal);
            if (state.status === "failed") throw new Error(state.error);
            if (state.status === "completed") {
                const target = state.results.find((item) => Boolean(item.url));
                if (!target?.url) throw new Error(apiText("audioGenerationFailed"));
                const res = await axios.get<Blob>(withLocalProxy(target.url), { responseType: "blob", signal: options?.signal });
                return res.data.type.startsWith("audio/") ? res.data : new Blob([res.data], { type: "audio/wav" });
            }
            if (attempt === 119) throw new Error("AutoDL 语音任务超时");
            await delay(2500, options?.signal);
        }
        throw new Error("AutoDL 语音任务超时");
    } catch (error) {
        throw new Error(readRelayError(error, apiText("audioGenerationFailed")));
    }
}

/* ==========================================================================
 *  3. RouterAPI (Rou-SD2.5 / Seedance 2.0 & 2.5) — https://routerapi.net/pricing
 *     - Channels: GET  /v1/video/quote?view=channels&model={model}
 *     - Quote:    GET  /v1/video/quote?model={model}&duration={d}&channelId={id}&billingMode={mode}
 *     - Inputs:   POST /v1/video/inputs/lookup -> POST /v1/video/inputs (or chunked /v1/video/inputs/uploads)
 *     - Create:   POST /v1/video/generations/seconds (PER_SECOND) | /v1/video/generations (PER_COUNT)
 *     - Poll:     GET  /v1/video/generations/{task_id}
 * ========================================================================== */

const ROUTERAPI_DIRECT_UPLOAD_LIMIT = 16 * 1024 * 1024;
const ROUTERAPI_VALID_RATIOS = ["16:9", "21:9", "9:16", "4:3", "3:4", "1:1"] as const;

type RouterApiChannelInfo = {
    id: number;
    key?: string;
    name?: string;
    upstreamModel?: string;
    billingMode?: "PER_SECOND" | "PER_COUNT";
    priceCNY?: number;
    order?: number;
    capabilities?: {
        minDuration?: number;
        maxDuration?: number;
        durations?: number[];
        maxImages?: number;
        maxVideos?: number;
        maxAudios?: number;
        ratios?: string[];
        resolutions?: string[];
    };
};

type RouterApiQuote = {
    channelId: number;
    model: string;
    duration: number;
    chargeQuota: number;
    chargeCNY: number;
    walletQuota: number;
    walletSufficient: boolean;
    billingMode?: "PER_SECOND" | "PER_COUNT";
};

function isRouterApiSeedanceModel(name: string) {
    const clean = name.trim().toLowerCase();
    return clean === "seedance-2.0" || clean === "seedance-2.5";
}

function routerApiHeaders(apiKey: string, contentType?: string) {
    return {
        Authorization: `Bearer ${apiKey.trim()}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

async function sha256Hex(blob: Blob): Promise<string | null> {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    try {
        const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    } catch {
        return null;
    }
}

function pickRouterApiDuration(modelName: string, rawSeconds: string | undefined, caps?: RouterApiChannelInfo["capabilities"]) {
    const min = caps?.minDuration ?? 4;
    const max = caps?.maxDuration ?? (modelName === "seedance-2.0" ? 15 : 30);
    const parsed = Math.round(Number(rawSeconds) || 5);
    const clamped = Math.max(min, Math.min(max, parsed));
    if (Array.isArray(caps?.durations) && caps.durations.length) {
        if (caps.durations.includes(clamped)) return clamped;
        return caps.durations.reduce((best, cur) => (Math.abs(cur - clamped) < Math.abs(best - clamped) ? cur : best), caps.durations[0]);
    }
    return clamped;
}

function pickRouterApiRatio(size: string | undefined, allowed?: string[]) {
    const inferred = inferVideoRatio(size || "16:9");
    const list = Array.isArray(allowed) && allowed.length ? allowed : [...ROUTERAPI_VALID_RATIOS];
    if (inferred !== "auto" && list.includes(inferred)) return inferred;
    return list.includes("16:9") ? "16:9" : list[0] || "16:9";
}

async function uploadRouterApiInput(
    config: Pick<AiConfig, "baseUrl" | "apiKey">,
    modelName: string,
    channelId: number,
    file: File,
    role: "reference_image" | "reference_video" | "reference_audio",
    signal?: AbortSignal,
): Promise<{ role: typeof role; fileId: string }> {
    const sha256 = await sha256Hex(file);
    const lookupParams = new URLSearchParams({ model: modelName, channelId: String(channelId) });

    if (sha256) {
        try {
            const lookup = (
                await axios.post<{ hit?: boolean; fileId?: string }>(
                    buildApiUrl(config.baseUrl, `/video/inputs/lookup?${lookupParams}`),
                    { sha256, sizeBytes: file.size, fileName: file.name, role },
                    { headers: routerApiHeaders(config.apiKey, "application/json"), signal },
                )
            ).data;
            if (lookup?.hit && lookup.fileId) {
                return { role, fileId: lookup.fileId };
            }
        } catch {
            // Fall through to direct upload if lookup is unavailable.
        }
    }

    if (file.size <= ROUTERAPI_DIRECT_UPLOAD_LIMIT) {
        const form = new FormData();
        form.append("role", role);
        form.append("file", file, file.name);
        const uploaded = (
            await axios.post<{ fileId?: string }>(
                buildApiUrl(config.baseUrl, `/video/inputs?${lookupParams}`),
                form,
                { headers: routerApiHeaders(config.apiKey), signal },
            )
        ).data;
        if (!uploaded?.fileId) throw new Error("RouterAPI 参考素材上传未返回 fileId");
        return { role, fileId: uploaded.fileId };
    }

    if (!sha256) throw new Error("大文件分片上传需要安全上下文（localhost 或 HTTPS）以计算 SHA-256");
    const init = (
        await axios.post<{ uploadId?: string; chunkSizeBytes?: number; nextIndex?: number }>(
            buildApiUrl(config.baseUrl, `/video/inputs/uploads?${lookupParams}`),
            { fileName: file.name, role, sha256, sizeBytes: file.size },
            { headers: routerApiHeaders(config.apiKey, "application/json"), signal },
        )
    ).data;
    if (!init?.uploadId || !init.chunkSizeBytes) throw new Error("RouterAPI 分片上传初始化失败");

    const uploadPath = `/video/inputs/uploads/${encodeURIComponent(init.uploadId)}`;
    for (let idx = init.nextIndex || 0, offset = idx * init.chunkSizeBytes; offset < file.size; idx += 1, offset += init.chunkSizeBytes) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const chunk = file.slice(offset, Math.min(file.size, offset + init.chunkSizeBytes));
        const chunkHash = await sha256Hex(chunk);
        await axios.put(
            buildApiUrl(config.baseUrl, `${uploadPath}/parts/${idx}?${lookupParams}`),
            chunk,
            {
                headers: {
                    ...routerApiHeaders(config.apiKey, "application/octet-stream"),
                    ...(chunkHash ? { "X-Chunk-SHA256": chunkHash } : {}),
                },
                signal,
            },
        );
    }

    await axios.post(
        buildApiUrl(config.baseUrl, `${uploadPath}/complete?${lookupParams}`),
        {},
        { headers: routerApiHeaders(config.apiKey, "application/json"), signal },
    );

    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const status = (
            await axios.get<{ status?: string; fileId?: string; error?: { message?: string } }>(
                buildApiUrl(config.baseUrl, `${uploadPath}?${lookupParams}`),
                { headers: routerApiHeaders(config.apiKey), signal },
            )
        ).data;
        if (status?.status === "READY" && status.fileId) return { role, fileId: status.fileId };
        if (status?.status === "FAILED" || status?.status === "EXPIRED") {
            throw new Error(status.error?.message || "RouterAPI 参考素材处理失败");
        }
        await delay(2000, signal);
    }
    throw new Error("RouterAPI 参考素材处理超时");
}

export async function createRouterApiVideoTask(
    config: AiConfig,
    model: string,
    prompt: string,
    references: ReferenceImage[],
    options?: VideoMediaOptions,
): Promise<{ id: string; provider: "routerapi"; model: string }> {
    const modelName = modelOptionName(model).trim();
    const images = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const trimmedPrompt = prompt.trim();

    if (isRouterApiSeedanceModel(modelName)) {
        try {
            const channelResp = (
                await axios.get<{ channels?: RouterApiChannelInfo[] }>(
                    buildApiUrl(config.baseUrl, `/video/quote?view=channels&model=${encodeURIComponent(modelName)}`),
                    { headers: routerApiHeaders(config.apiKey), signal: options?.signal },
                )
            ).data;
            const channels = Array.isArray(channelResp?.channels)
                ? [...channelResp.channels].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id - b.id)
                : [];
            const channel = channels[0];
            if (!channel?.id) throw new Error(`RouterAPI 当前暂无可用的 ${modelName} 渠道，请检查令牌分组是否已选择 seedance`);

            const caps = channel.capabilities;
            const duration = pickRouterApiDuration(modelName, config.videoSeconds, caps);
            const ratio = pickRouterApiRatio(config.size, caps?.ratios);
            const resolution = caps?.resolutions?.[0] || "720P";
            const preferredBilling = channel.billingMode || "PER_SECOND";

            const quoteParams = new URLSearchParams({
                model: modelName,
                duration: String(duration),
                channelId: String(channel.id),
                billingMode: preferredBilling,
            });
            const quote = (
                await axios.get<RouterApiQuote>(
                    buildApiUrl(config.baseUrl, `/video/quote?${quoteParams}`),
                    { headers: routerApiHeaders(config.apiKey), signal: options?.signal },
                )
            ).data;
            if (quote && quote.walletSufficient === false) {
                throw new Error(`RouterAPI 账户余额不足（预计消耗 ¥${quote.chargeCNY}）`);
            }

            const billingMode = quote?.billingMode || preferredBilling;
            const maxImages = caps?.maxImages ?? (modelName === "seedance-2.0" ? 9 : 30);
            const maxVideos = caps?.maxVideos ?? (modelName === "seedance-2.0" ? 3 : 10);
            const maxAudios = caps?.maxAudios ?? (modelName === "seedance-2.0" ? 3 : 10);

            const inputFiles: Array<{ role: string; fileId: string }> = [];
            for (const file of images.slice(0, maxImages)) {
                inputFiles.push(await uploadRouterApiInput(config, modelName, channel.id, file, "reference_image", options?.signal));
            }
            for (const file of videos.slice(0, maxVideos)) {
                inputFiles.push(await uploadRouterApiInput(config, modelName, channel.id, file, "reference_video", options?.signal));
            }
            for (const file of audios.slice(0, maxAudios)) {
                inputFiles.push(await uploadRouterApiInput(config, modelName, channel.id, file, "reference_audio", options?.signal));
            }

            const submitPath = billingMode === "PER_COUNT" ? "/video/generations" : "/video/generations/seconds";
            const submitResp = (
                await axios.post<{ task_id?: string; id?: string }>(
                    buildApiUrl(config.baseUrl, `${submitPath}?channelId=${encodeURIComponent(String(channel.id))}`),
                    {
                        model: modelName,
                        prompt: trimmedPrompt,
                        duration,
                        faceProcessing: true,
                        billingMode,
                        ...(Number.isFinite(quote?.chargeCNY) ? { expectedChargeCNY: quote.chargeCNY } : {}),
                        ratio,
                        resolution,
                        inputFiles,
                        ...(channel.upstreamModel ? { expectedUpstreamModel: channel.upstreamModel } : {}),
                    },
                    { headers: routerApiHeaders(config.apiKey, "application/json"), signal: options?.signal },
                )
            ).data;
            const taskId = submitResp?.task_id || submitResp?.id;
            if (!taskId) throw new Error(apiText("noVideoTaskId"));
            return { id: `sd:${taskId}`, provider: "routerapi", model };
        } catch (error) {
            // Only fall back to legacy /v1/videos if /v1/video/quote does not exist (404) on a custom proxy
            if (!axios.isAxiosError(error) || error.response?.status !== 404) {
                throw new Error(readRelayError(error, apiText("videoTaskCreateFailed")));
            }
        }
    }

    // Standard OpenAI-video endpoint (/v1/videos) for non-Seedance models or legacy fallback
    const body = new FormData();
    body.append("model", modelName);
    body.append("prompt", trimmedPrompt);
    body.append("seconds", String(pickRouterApiDuration(modelName, config.videoSeconds)));
    const ratio = pickRouterApiRatio(config.size);
    body.append("size", ratio === "9:16" || ratio === "3:4" ? "720x1280" : "1280x720");
    body.append("resolution_name", `${parseVideoResolution(config.vquality)}p`);
    body.append("preset", "normal");
    images.slice(0, 7).forEach((file, idx) => body.append("input_reference[]", file, file.name || `ref_${idx + 1}.png`));
    try {
        const resp = (
            await axios.post<{ id?: string; data?: { id?: string } }>(
                buildApiUrl(config.baseUrl, "/videos"),
                body,
                { headers: routerApiHeaders(config.apiKey), signal: options?.signal },
            )
        ).data;
        const id = resp?.id || resp?.data?.id;
        if (!id) throw new Error(apiText("noVideoTaskId"));
        return { id: `v1:${id}`, provider: "routerapi", model };
    } catch (error) {
        throw new Error(readRelayError(error, apiText("videoTaskCreateFailed")));
    }
}

export async function pollRouterApiVideoTask(
    config: AiConfig,
    taskId: string,
    options?: RequestOptions,
): Promise<RelayVideoTaskState> {
    if (taskId.startsWith("v1:")) {
        const rawId = taskId.slice(3);
        try {
            const resp = (
                await axios.get<{
                    status?: string;
                    url?: string;
                    video_url?: string;
                    result_url?: string;
                    content?: { video_url?: string; url?: string };
                    error?: { message?: string };
                    data?: { status?: string; url?: string; video_url?: string; result_url?: string; error?: { message?: string } };
                }>(buildApiUrl(config.baseUrl, `/videos/${encodeURIComponent(rawId)}`), {
                    headers: routerApiHeaders(config.apiKey),
                    signal: options?.signal,
                })
            ).data;
            const video = resp?.data || resp || {};
            const url = [video.video_url, video.result_url, video.url, (video as { content?: { video_url?: string; url?: string } }).content?.video_url, (video as { content?: { video_url?: string; url?: string } }).content?.url].find(
                (u): u is string => typeof u === "string" && /^https?:\/\//i.test(u),
            );
            if (url) return { status: "completed", result: await downloadMediaResult(url, "video/mp4", options) };
            if (video.status === "completed") {
                const content = await axios.get<Blob>(buildApiUrl(config.baseUrl, `/videos/${encodeURIComponent(rawId)}/content`), {
                    headers: routerApiHeaders(config.apiKey),
                    responseType: "blob",
                    signal: options?.signal,
                });
                return { status: "completed", result: { blob: content.data, mimeType: content.data.type || "video/mp4" } };
            }
            if (video.status === "failed" || video.status === "cancelled") {
                return { status: "failed", error: video.error?.message || apiText("videoGenerationFailed") };
            }
            return { status: "pending" };
        } catch (error) {
            throw new Error(readRelayError(error, apiText("videoTaskQueryFailed")));
        }
    }

    const rawId = taskId.startsWith("sd:") ? taskId.slice(3) : taskId;
    try {
        const resp = (
            await axios.get<{
                code?: string | number;
                message?: string;
                data?: { status?: string; result_url?: string; fail_reason?: string };
            }>(buildApiUrl(config.baseUrl, `/video/generations/${encodeURIComponent(rawId)}`), {
                headers: routerApiHeaders(config.apiKey),
                signal: options?.signal,
            })
        ).data;
        if (resp?.code !== undefined && resp.code !== "success" && resp.code !== 0 && resp.code !== "0") {
            throw new Error(readRelayErrorData(resp) || apiText("videoTaskQueryFailed"));
        }
        const data = resp?.data;
        const status = String(data?.status || "").toUpperCase();
        if (status === "SUCCESS") {
            if (!data?.result_url || !/^https?:\/\//i.test(data.result_url)) {
                return { status: "failed", error: apiText("noPlayableVideo") };
            }
            return { status: "completed", result: await downloadMediaResult(data.result_url, "video/mp4", options) };
        }
        if (status === "FAILURE" || status === "FAILED") {
            return { status: "failed", error: data?.fail_reason || apiText("videoGenerationFailed") };
        }
        return { status: "pending" };
    } catch (error) {
        throw new Error(readRelayError(error, apiText("videoTaskQueryFailed")));
    }
}

/* ==========================================================================
 *  Shared helpers
 * ========================================================================== */

async function downloadMediaResult(url: string, fallbackMime: string, options?: RequestOptions): Promise<RelayVideoTaskResult> {
    try {
        const response = await axios.get<Blob>(withLocalProxy(url), { responseType: "blob", signal: options?.signal });
        if (response.data.type.includes("json")) {
            return { url, mimeType: fallbackMime };
        }
        return { blob: response.data, mimeType: response.data.type || fallbackMime };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: fallbackMime };
    }
}

async function referenceMediaToFile(
    item: { name: string; type?: string; url?: string; storageKey?: string },
    fallbackName: string,
    errorKey: "invalidReferenceVideo" | "invalidReferenceAudio",
    options?: RequestOptions,
) {
    let blob = item.storageKey ? await getMediaBlob(item.storageKey) : null;
    if (!blob) {
        const url = item.storageKey ? await resolveMediaUrl(item.storageKey, item.url || "") : item.url || "";
        if (!url) throw new Error(apiText(errorKey));
        try {
            blob = await (await fetch(withLocalProxy(url), { signal: options?.signal })).blob();
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            throw new Error(apiText(errorKey));
        }
    }
    if (!blob.size) throw new Error(apiText(errorKey));
    return new File([blob], item.name || fallbackName, { type: item.type || blob.type || "application/octet-stream" });
}

async function referenceMediaToDataUrl(
    item: { name: string; type?: string; url?: string; storageKey?: string },
    fallbackName: string,
    errorKey: "invalidReferenceVideo" | "invalidReferenceAudio",
    options?: RequestOptions,
) {
    if (!item.storageKey && item.url && /^https?:\/\//i.test(item.url)) return item.url;
    const file = await referenceMediaToFile(item, fallbackName, errorKey, options);
    return readFileAsDataUrl(file);
}

function readRelayErrorData(data: unknown): string {
    if (!data) return "";
    if (typeof data === "string") {
        try {
            return readRelayErrorData(JSON.parse(data)) || (/<[a-z][\s\S]*>/i.test(data) ? "" : data);
        } catch {
            return /<[a-z][\s\S]*>/i.test(data) ? "" : data;
        }
    }
    if (typeof data !== "object") return "";
    const obj = data as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown; details?: Record<string, unknown> };
    const errMsg = typeof obj.error === "string" ? obj.error : (obj.error as { message?: unknown } | undefined)?.message;
    const base =
        readRelayErrorData(obj.msg) ||
        readRelayErrorData(obj.message) ||
        readRelayErrorData(errMsg) ||
        readRelayErrorData(obj.detail);
    if (base && obj.details && typeof obj.details === "object") {
        const extra = Object.entries(obj.details)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join("；");
        return extra ? `${base}（${extra}）` : base;
    }
    return base;
}

function readRelayError(error: unknown, fallback: string) {
    if (axios.isCancel(error) || (error instanceof DOMException && error.name === "AbortError")) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("requestFailed");
        const detail = readRelayErrorData(error.response?.data);
        if (detail) return detail;
        if (error.response?.status === 401 || error.response?.status === 403) return apiText("authenticationFailed");
        if (error.response?.status === 429) return apiText("rateLimited");
        return error.response?.status ? `${fallback}（${error.response.status}）` : error.message || fallback;
    }
    return error instanceof Error ? error.message || fallback : fallback;
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
