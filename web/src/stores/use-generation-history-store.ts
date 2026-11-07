import localforage from "localforage";
import { create } from "zustand";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { readImageHistory, type ImageHistoryLog } from "@/pages/gallery/gallery-data";

const history = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
let pending: Promise<unknown> = Promise.resolve();
const saved = new Set<string>();
const queued = new Set<string>();
export const useGenerationHistoryStore = create<{ logs: ImageHistoryLog[]; loading: boolean; error: string; refresh: () => Promise<void> }>((set) => ({
    logs: [], loading: true, error: "",
    refresh: async () => {
        set({ loading: true, error: "" });
        try { await pending; set({ logs: await readImageHistory() }); }
        catch { set({ error: "读取生成历史失败，请保留本地数据并重试。" }); }
        finally { set({ loading: false }); }
    },
}));

// Archive each generated output independently of its canvas node. Originals stay in image_files.
export function recordCanvasImageHistory(project: Pick<CanvasProject, "id" | "title" | "nodes" | "updatedAt">) {
    const records: ImageHistoryLog[] = [];
    for (const node of project.nodes) {
        const metadata = node.metadata;
        if (!metadata || !(metadata.generationType || (metadata.model && metadata.prompt))) continue;
        const images = metadata.images?.filter((image) => image.status === "success").map((image) => ({ id: image.id, dataUrl: image.storageKey ? "" : image.content, storageKey: image.storageKey, width: image.naturalWidth, height: image.naturalHeight })) || [];
        if (metadata.status === "success" && (metadata.storageKey || metadata.content) && (node.type === "image" || metadata.mimeType?.startsWith("image/"))) images.push({ id: node.id, dataUrl: metadata.storageKey ? "" : metadata.content || "", storageKey: metadata.storageKey, width: metadata.naturalWidth || 0, height: metadata.naturalHeight || 0 });
        for (const image of images) {
            if (!image.storageKey && (!image.dataUrl || image.dataUrl.startsWith("blob:"))) continue;
            const id = `canvas:${image.storageKey || `${project.id}:${node.id}:${image.id}`}`;
            if (saved.has(id) || queued.has(id)) continue;
            queued.add(id);
            records.push({ id, title: node.title, prompt: metadata.prompt, model: metadata.model, quality: metadata.quality, createdAt: Date.parse(project.updatedAt) || Date.now(), projectId: project.id, projectTitle: project.title, nodeId: node.id, images: [image] });
        }
    }
    if (!records.length) return pending;
    pending = pending.catch(() => undefined).then(async () => {
        let changed = false;
        for (const record of records) {
            if (saved.has(record.id)) continue;
            if (!await history.getItem(record.id)) { await history.setItem(record.id, record); changed = true; }
            saved.add(record.id);
            queued.delete(record.id);
        }
        if (changed) useGenerationHistoryStore.setState({ logs: await readImageHistory(), error: "" });
    }).catch((error) => { records.forEach((record) => queued.delete(record.id)); useGenerationHistoryStore.setState({ error: "生成历史保存失败，请保留本地数据；未保存的图片请先留在画布中。" }); throw error; });
    return pending;
}

export function flushGenerationHistory() { return pending; }
