import { nanoid } from "nanoid";
import { blobDataUrl, exportName, uniqueExportName, type ExportFolder } from "@/lib/export-fs";
import { deleteStoredImages, fetchImageBlob, getImageBlob, resolveImageUrl, setImageBlob } from "@/services/image-storage";
import { deleteStoredMedia, getMediaBlob, resolveMediaUrl, setMediaBlob } from "@/services/file-storage";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CanvasConnection, CanvasNodeData, Position } from "@/types/canvas";

export type WorkflowGraph = { name: string; nodes: CanvasNodeData[]; connections: CanvasConnection[] };
type ProjectDetails = Pick<CanvasProject, "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">;
export interface BlinkFlowWorkflowFileV1 extends WorkflowGraph {
    format: "blinkflow-workflow";
    version: 1;
    exportedAt: string;
    imageCompression: "original" | "webp";
    assets: Record<string, { mimeType: string; dataUrl: string }>;
    project?: ProjectDetails;
}

const assetPrefix = "workflow-asset://";
const localUrl = /^(blob:|data:(image|audio|video)\/)/i;
const supportedMime = /^(image|audio|video)\/[\w.+-]+$/i;
const storageField = /(?:^storageKey$|StorageKey$)/;
const storageReference = /^(?:image|audio|video|file):[^/]+$/i;
type Asset = { blob: Blob; name: string; digest: string };
type Edge = CanvasConnection & { sourceId?: string; targetId?: string };
const endpoints = (edge: Edge) => [edge.fromNodeId ?? edge.sourceId, edge.toNodeId ?? edge.targetId] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const readStored = (key: string) => key.startsWith("image:") ? getImageBlob(key) : getMediaBlob(key);
const resolveStored = (key: string, fallback: string) => key.startsWith("image:") ? resolveImageUrl(key, fallback) : resolveMediaUrl(key, fallback);

async function digestBlob(blob: Blob) {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Walk only the exported graph/project, not application settings. Prefer originals over preview/blob URLs.
export async function collectWorkflowAssets(graph: WorkflowGraph, project?: ProjectDetails) {
    const assets = new Map<string, Asset>(), sources = new Map<string, string>();
    const add = async (source: string, name: string, storageKey?: string) => {
        const existing = sources.get(storageKey || source);
        if (existing) return existing;
        const stored = storageKey ? await readStored(storageKey) : null;
        let blob = stored;
        if (!blob && source && (localUrl.test(source) || /^https?:\/\//i.test(source))) {
            try { blob = /^https?:/i.test(source) ? await fetchImageBlob(source) : await (await fetch(source)).blob(); }
            catch { /* The error below identifies which original was unavailable. */ }
        }
        if (!blob?.size || !supportedMime.test(blob.type)) throw new Error(`无法读取「${name}」的原始素材，请重新连接或导入素材后再试`);
        const digest = await digestBlob(blob);
        const id = `${digest}-${blob.type.replace(/[^a-z0-9]/gi, "-")}`;
        if (!assets.has(id)) assets.set(id, { blob, name, digest });
        if (storageKey) sources.set(storageKey, id);
        if (source) sources.set(source, id);
        return id;
    };
    async function visit(value: unknown, name: string, remembered: Record<string, string> = {}, remoteContent = false, field?: string): Promise<unknown> {
        if (typeof value === "string") {
            if (value && field && (storageField.test(field) || (field === "references" && storageReference.test(value)))) return assetPrefix + await add("", name, value);
            if (localUrl.test(value) || (remoteContent && field === "content" && /^https?:\/\//i.test(value))) return assetPrefix + await add(value, name, Object.hasOwn(remembered, value) ? remembered[value] : undefined);
            return value;
        }
        if (Array.isArray(value)) {
            const next = [];
            for (const item of value) next.push(await visit(item, name, remembered, false, field));
            return next;
        }
        if (!isRecord(value)) return value;
        const next: [string, unknown][] = [];
        const stored = typeof value.storageKey === "string" && value.storageKey ? value.storageKey : undefined;
        const url = [value.content, value.dataUrl, value.url].find((item): item is string => typeof item === "string" && /^(blob:|data:|https?:)/i.test(item));
        const shared = stored ? assetPrefix + await add(url || "", name, stored) : undefined;
        for (const [key, item] of Object.entries(value)) {
            if (key === "workflowAssetUrls") continue;
            next.push([key, shared && (key === "storageKey" || (item === url && url !== undefined && ["content", "dataUrl", "url"].includes(key))) ? shared : await visit(item, name, remembered, remoteContent, key)]);
        }
        return Object.fromEntries(next);
    }
    const nodes: CanvasNodeData[] = [];
    for (const node of graph.nodes) {
        const remote = ["image", "video", "audio", "blinkflow:fusion"].includes(node.type);
        nodes.push({ ...node, metadata: await visit(node.metadata, node.title || node.type, node.metadata?.workflowAssetUrls, remote) as CanvasNodeData["metadata"] });
    }
    const ids = new Set(nodes.map(({ id }) => id));
    return { name: graph.name, nodes, connections: graph.connections.filter((edge) => endpoints(edge).every((id) => ids.has(id))), assets, project: project ? await visit(project, graph.name) as ProjectDetails : undefined };
}

type Collected = Awaited<ReturnType<typeof collectWorkflowAssets>>;

async function asWebp(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("当前环境无法压缩 WebP");
        ctx.drawImage(bitmap, 0, 0);
        const converted = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
        if (converted?.type !== "image/webp") throw new Error("当前环境无法压缩 WebP，请关闭压缩再试");
        return converted;
    } finally { bitmap.close(); }
}

export async function serializeWorkflowToJson({ compressWebp = false, collected, ...graph }: WorkflowGraph & { compressWebp?: boolean; collected?: Collected }) {
    const { name, nodes, connections, assets, project } = collected ?? await collectWorkflowAssets(graph);
    const encoded: BlinkFlowWorkflowFileV1["assets"] = {}, identities = new Map<string, string>();
    for (const [key, { blob, digest }] of assets) {
        const file = compressWebp && blob.type.startsWith("image/") ? await asWebp(blob) : blob;
        encoded[key] = { mimeType: file.type, dataUrl: await blobDataUrl(file) };
        if (file !== blob) identities.set(digest, await digestBlob(file));
    }
    // A fusion crop can include the hash of its source image. Keep it valid after re-encoding.
    const outputNodes = nodes.map((node) => {
        const context = node.metadata?.cropContext;
        const identity = context && "sourceIdentity" in context ? identities.get(context.sourceIdentity) : undefined;
        return identity ? { ...node, metadata: { ...node.metadata, cropContext: { ...context!, sourceIdentity: identity } } } as CanvasNodeData : node;
    });
    const output: BlinkFlowWorkflowFileV1 = { format: "blinkflow-workflow", version: 1, name, exportedAt: new Date().toISOString(), imageCompression: compressWebp ? "webp" : "original", nodes: outputNodes, connections, assets: encoded, project };
    return JSON.stringify(output);
}

export async function buildCanvasExportFolders(projects: CanvasProject[], backup: boolean, dated: boolean) {
    const folders: ExportFolder[] = [], used = new Set<string>(), date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    for (const { title, nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo, viewport } of projects) {
        const name = exportName(title), graph = { name: title, nodes, connections };
        const data = await collectWorkflowAssets(graph, backup ? { chatSessions, activeChatId, backgroundMode, showImageInfo, viewport } : undefined);
        const names = new Set<string>();
        const files = Array.from(data.assets.values(), ({ blob, name: assetName }) => {
            const type = blob.type.split("/")[1];
            const ext = ({ jpeg: "jpg", "svg+xml": "svg", "x-wav": "wav", mpeg: "mp3", "quicktime": "mov" })[type] ?? type.replace(/[^a-z0-9]/gi, "");
            const stem = exportName(assetName).replace(new RegExp(`\\.${ext}$`, "i"), "");
            return { filename: uniqueExportName(stem || "素材", names, `.${ext}`), data: blob as Blob | string };
        });
        if (backup) files.push({ filename: `${name}.blinkflow.json`, data: await serializeWorkflowToJson({ ...graph, collected: data }) });
        folders.push({ folderName: uniqueExportName(dated ? `${name}_${stamp}` : name, used), files });
    }
    return folders;
}

async function rewrite(value: unknown, map: (value: string, field?: string) => string | Promise<string>, field?: string): Promise<unknown> {
    if (typeof value === "string") return map(value, field);
    if (Array.isArray(value)) return Promise.all(value.map((item) => rewrite(item, map, field)));
    if (!isRecord(value)) return value;
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, raw]) => [key, await rewrite(raw, map, key)])));
}

// Some node-specific URL fields have no adjacent storageKey. Keep their mapping across reloads.
export async function hydrateWorkflowAssetUrls(node: CanvasNodeData): Promise<CanvasNodeData> {
    const remembered = node.metadata?.workflowAssetUrls;
    if (!remembered) return node;
    const { workflowAssetUrls: _, ...fields } = node.metadata!;
    const refreshed: Record<string, string> = {};
    const metadata = await rewrite(fields, async (url) => {
        if (!Object.hasOwn(remembered, url)) return url;
        const key = remembered[url], next = await resolveStored(key, url);
        refreshed[next] = key;
        return next;
    }) as NonNullable<CanvasNodeData["metadata"]>;
    return { ...node, metadata: { ...metadata, workflowAssetUrls: refreshed } };
}

export async function parseAndImportWorkflowJson(jsonText: string, currentViewportCenter: Position) {
    let data: BlinkFlowWorkflowFileV1;
    try { data = JSON.parse(jsonText); } catch { throw new Error("无法读取工作流：文件不是有效的 JSON"); }
    if (data?.format !== "blinkflow-workflow" || data.version !== 1 || !Array.isArray(data.nodes) || !Array.isArray(data.connections) || !isRecord(data.assets)) throw new Error("不支持此工作流格式，请选择 BlinkFlow 导出的 .blinkflow.json");
    const ids = new Map<string, string>();
    for (const node of data.nodes) {
        if (!node || typeof node.id !== "string" || !node.id || ids.has(node.id) || typeof node.title !== "string" || typeof node.type !== "string" || (node.metadata !== undefined && !isRecord(node.metadata)) || !node.position || ![node.position.x, node.position.y, node.width, node.height].every(Number.isFinite) || node.width <= 0 || node.height <= 0) throw new Error("工作流存在无效或重复的节点");
        ids.set(node.id, crypto.randomUUID?.() ?? nanoid());
    }
    const connections = data.connections.map((edge: Edge) => {
        if (!isRecord(edge)) throw new Error("工作流存在无效的连线");
        const [source, target] = endpoints(edge);
        const fromNodeId = ids.get(source), toNodeId = ids.get(target);
        if (!fromNodeId || !toNodeId) throw new Error("工作流连线指向不存在的节点");
        return { ...edge, id: crypto.randomUUID?.() ?? nanoid(), fromNodeId, toNodeId, ...(edge.sourceId !== undefined ? { sourceId: fromNodeId } : {}), ...(edge.targetId !== undefined ? { targetId: toNodeId } : {}) };
    });
    if (!data.nodes.length) return { nodes: [], connections };
    const needed = new Set<string>();
    for (const node of data.nodes) await rewrite(node.metadata, (value, field) => {
        if (value.startsWith(assetPrefix)) needed.add(value.slice(assetPrefix.length));
        else if (localUrl.test(value) || (value && field && (storageField.test(field) || (field === "references" && storageReference.test(value))))) throw new Error("工作流包含未打包的本地素材");
        return value;
    });
    const blobs = new Map<string, Blob>();
    for (const id of needed) {
        const asset = Object.hasOwn(data.assets, id) ? data.assets[id] : undefined;
        if (!asset || typeof asset.mimeType !== "string" || typeof asset.dataUrl !== "string" || !supportedMime.test(asset.mimeType) || !asset.dataUrl.startsWith(`data:${asset.mimeType};base64,`)) throw new Error("工作流缺少素材或素材格式无效");
        let blob: Blob;
        try { blob = await (await fetch(asset.dataUrl)).blob(); } catch { throw new Error("工作流内嵌素材无法解码"); }
        if (!blob.size || blob.type !== asset.mimeType.toLowerCase()) throw new Error("工作流内嵌素材无效");
        blobs.set(id, blob);
    }
    const stored = new Map<string, { key: string; url: string; mimeType: string; size: number }>();
    const imageKeys: string[] = [], mediaKeys: string[] = [];
    try {
        for (const [id, blob] of blobs) {
            const kind = blob.type.split("/")[0], key = `${kind}:${nanoid()}`;
            (kind === "image" ? imageKeys : mediaKeys).push(key);
            const url = kind === "image" ? await setImageBlob(key, blob) : await setMediaBlob(key, blob);
            stored.set(id, { key, url, mimeType: blob.type, size: blob.size });
        }
        const bounds = data.nodes.reduce((box, node) => ({ left: Math.min(box.left, node.position.x), top: Math.min(box.top, node.position.y), right: Math.max(box.right, node.position.x + node.width), bottom: Math.max(box.bottom, node.position.y + node.height) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        const dx = currentViewportCenter.x - (bounds.left + bounds.right) / 2, dy = currentViewportCenter.y - (bounds.top + bounds.bottom) / 2;
        const byKey = new Map([...stored.values()].map((asset) => [asset.key, asset]));
        const oldIds = [...ids.keys()].sort((a, b) => b.length - a.length);
        const nodeFields = new Set(["groupId", "sourceNodeId", "generationOriginId", "llmOutputNodeId", "referenceNodeOrder", "outputIds"]);
        const nodes = await Promise.all(data.nodes.map(async (node) => {
            const remembered: Record<string, string> = {};
            const metadata = await rewrite(node.metadata, (value, field) => {
                if (value.startsWith(assetPrefix)) {
                    const asset = stored.get(value.slice(assetPrefix.length))!;
                    if (field && (storageField.test(field) || field === "references")) return asset.key;
                    remembered[asset.url] = asset.key;
                    return asset.url;
                }
                if (field && nodeFields.has(field)) return ids.get(value) ?? "";
                if (field === "mediaNodeIds") {
                    const old = oldIds.find((id) => value === id || value.startsWith(`${id}:`));
                    return old ? ids.get(old)! + value.slice(old.length) : value;
                }
                return field === "composerContent" ? value.replace(/@\[node:([^\]]+)\]/g, (token, id) => ids.has(id) ? `@[node:${ids.get(id)}]` : token) : value;
            }) as CanvasNodeData["metadata"];
            if (metadata) {
                const attach = (item: { content?: string; storageKey?: string; mimeType?: string; bytes?: number }) => {
                    const key = remembered[item.content || ""] ?? item.storageKey;
                    if (!key) return;
                    const asset = byKey.get(key);
                    if (asset) Object.assign(item, { content: item.content || asset.url, storageKey: key, mimeType: asset.mimeType, bytes: asset.size });
                };
                attach(metadata);
                metadata.images?.forEach(attach);
                if (Object.keys(remembered).length) metadata.workflowAssetUrls = remembered;
                if (metadata.status === "loading") metadata.status = "idle";
                for (const item of [...(metadata.images || []), ...(metadata.texts || [])]) if (item.status === "loading") item.status = "idle";
                delete metadata.generationStartedAt; delete metadata.videoTaskId; delete metadata.videoTaskProvider; delete metadata.tableBatchRun;
            }
            return { ...node, id: ids.get(node.id)!, position: { x: node.position.x + dx, y: node.position.y + dy }, metadata };
        }));
        return { nodes, connections };
    } catch (error) {
        await Promise.allSettled([deleteStoredImages(imageKeys), deleteStoredMedia(mediaKeys)]);
        throw error;
    }
}
