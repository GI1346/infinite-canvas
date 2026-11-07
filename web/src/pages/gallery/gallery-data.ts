import localforage from "localforage";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

export type GallerySource = { label: string; projectId?: string; nodeId?: string };
export type GalleryImage = { id: string; title: string; prompt: string; model: string; quality: string; date: number; width: number; height: number; url: string; storageKey?: string; sources: GallerySource[] };
export type ImageHistoryLog = { id: string; title?: string; prompt?: string; model?: string; quality?: string; createdAt?: number; projectId?: string; projectTitle?: string; nodeId?: string; images?: { id: string; dataUrl?: string; storageKey?: string; width?: number; height?: number }[] };
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

// Read the existing history only. No new copies of originals or changes to generation/storage.
export async function readImageHistory() {
    const logs: ImageHistoryLog[] = [];
    await logStore.iterate<ImageHistoryLog, void>(value => { if (value && Array.isArray(value.images)) logs.push(value); });
    return logs;
}

export function collectGalleryImages(projects: CanvasProject[], logs: ImageHistoryLog[]) {
    const images = new Map<string, GalleryImage>();
    const add = (item: GalleryImage) => {
        if (!item.storageKey && !item.url) return;
        const key = item.storageKey || item.url, previous = images.get(key);
        if (!previous) { images.set(key, { ...item, id: key }); return; }
        for (const source of item.sources) if (!previous.sources.some(s => s.projectId === source.projectId && s.nodeId === source.nodeId && s.label === source.label)) previous.sources.push(source);
        if (!previous.prompt) previous.prompt = item.prompt;
        if (!previous.model) previous.model = item.model;
        previous.date = Math.max(previous.date, item.date);
    };
    for (const project of projects) for (const node of project.nodes) {
        const meta = node.metadata;
        if (node.type !== "image" || !meta?.generationType) continue;
        const base = { title: node.title || "画布生成图片", prompt: meta.prompt || "", model: meta.model || "", quality: meta.quality || "", date: Date.parse(project.updatedAt) || 0, sources: [{ label: project.title, projectId: project.id, nodeId: node.id }] };
        for (const image of meta.images || []) if (image.status === "success") add({ ...base, id: image.id, url: image.content, storageKey: image.storageKey, width: image.naturalWidth, height: image.naturalHeight });
        if (meta.status === "success" && (meta.content || meta.storageKey)) add({ ...base, id: node.id, url: meta.content || "", storageKey: meta.storageKey, width: meta.naturalWidth || 0, height: meta.naturalHeight || 0 });
    }
    for (const log of logs) for (const image of log.images || []) add({ id: image.id, title: log.title || "工作台生成图片", prompt: log.prompt || "", model: log.model || "", quality: log.quality || "", date: Number(log.createdAt) || 0, url: image.dataUrl || "", storageKey: image.storageKey, width: image.width || 0, height: image.height || 0, sources: [{ label: log.projectTitle || "生图工作台", projectId: log.projectId, nodeId: log.nodeId }] });
    return [...images.values()].sort((a, b) => b.date - a.date);
}
