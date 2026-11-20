import localforage from "localforage";

import { diagnosticStoreName, flushDiagnosticLogs } from "@/services/diagnostics";
import { flushImagePreviewWrites } from "@/services/image-storage";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useGenerationRunnerStore } from "@/stores/canvas/use-generation-runner-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { flushGenerationHistory } from "@/stores/use-generation-history-store";

const canvasKey = "infinite-canvas:canvas_store", assetKey = "infinite-canvas:asset_store";
const imageLogs = "image_generation_logs", videoLogs = "video_generation_logs";
const fileStores = ["image_files", "image_previews", "media_files"];
const historyStores = [imageLogs, videoLogs, "canvas_assistant", "relay_tasks", diagnosticStoreName];
const mediaFields = new Set(["storageKey", "content", "dataUrl", "url", "coverUrl", "references"]);
const localResource = /^(?:data:(?:image|video|audio)\/|blob:|(?:image|video|audio|file):)/i;

function collectReferences(value: unknown, refs: Set<string>) {
    if (typeof value === "string") {
        if (localResource.test(value) || /^https?:\/\//i.test(value)) refs.add(value);
    } else if (value && typeof value === "object") {
        if ("storageKey" in value && typeof value.storageKey === "string") refs.add(value.storageKey);
        Object.values(value).forEach((item) => collectReferences(item, refs));
    }
}

function isReferenced(value: unknown, refs: Set<string>) {
    if (!value || typeof value !== "object") return false;
    const { storageKey, dataUrl, url } = value as { storageKey?: string; dataUrl?: string; url?: string };
    return storageKey ? refs.has(storageKey) : refs.has(dataUrl || url || "");
}

// Saved workflow snapshots can embed copies of media. Keep the workflow and its settings.
function stripUnusedLocalMedia(value: unknown, refs: Set<string>, field?: string): unknown {
    if (typeof value === "string") return (field === "storageKey" || (field !== undefined && mediaFields.has(field) && localResource.test(value))) && !refs.has(value) ? "" : value;
    if (Array.isArray(value)) return value.map((item) => stripUnusedLocalMedia(item, refs, field));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripUnusedLocalMedia(item, refs, key)]));
    return value;
}

function parseState<T>(raw: unknown, fallback: T): T {
    if (raw === undefined) return fallback;
    if (typeof raw !== "string") throw new Error("创作数据格式异常，未执行清理");
    const parsed = JSON.parse(raw);
    if (parsed.version !== 0 || !parsed.state || typeof parsed.state !== "object") throw new Error("创作数据格式异常，未执行清理");
    return parsed.state as T;
}

/** Only selected creative stores and keys are writable in this operation. */
export async function cleanResourceStorage(confirmedProjects: CanvasProject[]) {
    const { projects, deletedProjects } = useCanvasStore.getState();
    const empty = confirmedProjects.length === 0;
    const changed = () => new Error("画布数据已变化或尚未同步，请等保存完成后重新确认清理");
    const checkScope = () => {
        const current = useCanvasStore.getState();
        if (!current.hydrated || !useAssetStore.getState().hydrated) throw new Error("本地资源尚未加载完成");
        if (projects !== confirmedProjects || current.projects !== projects || current.deletedProjects !== deletedProjects) throw changed();
        if (Object.keys(useGenerationRunnerStore.getState().tasks).length) throw new Error("还有后台任务正在生成，请等待任务完成后再清理");
    };
    checkScope();
    await Promise.all([localforage.ready(), flushGenerationHistory(), flushImagePreviewWrites(), empty ? flushDiagnosticLogs() : undefined]);
    if (localforage.driver() !== localforage.INDEXEDDB) throw new Error("当前浏览器未启用 IndexedDB，未执行清理");
    checkScope();
    const refs = new Set<string>(), liveIds = new Set(projects.map(({ id }) => id));
    collectReferences(projects, refs);

    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("infinite-canvas");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            let tx: IDBTransaction | undefined, failure: unknown, unsubscribe = () => {};
            const finish = () => { unsubscribe(); db.close(); };
            const safe = (work: () => void) => {
                try { work(); }
                catch (error) { failure = error; if (tx) tx.abort(); else { finish(); reject(error); } }
            };
            safe(() => {
                checkScope();
                const stores = [...fileStores, ...historyStores].filter((name) => db.objectStoreNames.contains(name));
                const transaction = tx = db.transaction(["app_state", ...stores], "readwrite");
                transaction.oncomplete = () => { finish(); resolve(); };
                transaction.onabort = () => { finish(); reject(failure || transaction.error || new Error("资源清理已回滚")); };
                unsubscribe = useCanvasStore.subscribe(() => safe(checkScope));
                const state = transaction.objectStore("app_state");
                const saved = state.get(canvasKey);
                saved.onsuccess = () => safe(() => {
                    const disk = parseState(saved.result, { projects: [] as CanvasProject[], deletedProjects: [] as typeof deletedProjects });
                    if (JSON.stringify(disk.projects) !== JSON.stringify(projects) || JSON.stringify(disk.deletedProjects) !== JSON.stringify(deletedProjects)) throw changed();
                    if (deletedProjects.length) state.put(JSON.stringify({ state: { projects, deletedProjects: [] }, version: 0 }), canvasKey);
                    if (empty) {
                        state.delete(assetKey);
                        sweepKeys(state, (key) => typeof key === "string" && (key.startsWith("blinkflow:pose-gallery-cache-") || key === "infinite-canvas:" + imageLogs || key === "infinite-canvas:" + videoLogs));
                        stores.forEach((name) => transaction.objectStore(name).clear());
                        return;
                    }
                    const assets = state.get(assetKey);
                    assets.onsuccess = () => safe(() => {
                        if (assets.result === undefined) return;
                        const { assets: previous } = parseState(assets.result, { assets: [] as Asset[] });
                        const retained = previous.filter((asset) => asset.kind === "text" || isReferenced(asset.data, refs));
                        const cleaned = stripUnusedLocalMedia(retained, refs);
                        state.put(JSON.stringify({ state: { assets: cleaned }, version: 0 }), assetKey);
                    });
                    const originals = stores.includes("image_files") ? transaction.objectStore("image_files") : undefined;
                    for (const name of fileStores) if (stores.includes(name)) {
                        const store = transaction.objectStore(name);
                        sweepKeys(store, (key) => typeof key !== "string" || !refs.has(key) || (name === "image_previews" && !originals), name === "image_previews" ? originals : undefined);
                    }
                    if (stores.includes("canvas_assistant")) sweepKeys(transaction.objectStore("canvas_assistant"), (key) => typeof key !== "string" || !liveIds.has(key));
                    for (const name of [imageLogs, videoLogs]) if (stores.includes(name)) {
                        const cursorRequest = transaction.objectStore(name).openCursor();
                        cursorRequest.onsuccess = () => safe(() => {
                            const cursor = cursorRequest.result;
                            if (!cursor) return;
                            const entry = cursor.value;
                            const images = name === imageLogs && Array.isArray(entry?.images) ? entry.images.filter((item: unknown) => isReferenced(item, refs)) : [];
                            if (!entry || (entry.projectId && !liveIds.has(entry.projectId)) || (name === imageLogs ? !images.length : !isReferenced(entry?.video, refs))) cursor.delete();
                            else {
                                const references = Array.isArray(entry.references) ? entry.references.filter((item: unknown) => isReferenced(item, refs)) : undefined;
                                cursor.update({ ...entry, ...(name === imageLogs ? { images } : {}), ...(references ? { references } : {}) });
                            }
                            cursor.continue();
                        });
                    }
                });
            });
        };
    });
    // Refresh only the canvas store so an old in-memory recycle bin cannot be saved on reload.
    await useCanvasStore.persist.rehydrate();
}

function sweepKeys(store: IDBObjectStore, shouldDelete: (key: IDBValidKey) => boolean, originals?: IDBObjectStore) {
    const request = store.openKeyCursor();
    request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = cursor.primaryKey;
        if (shouldDelete(key)) store.delete(key);
        else if (originals) {
            const source = originals.getKey(key);
            source.onsuccess = () => { if (source.result === undefined) store.delete(key); };
        }
        cursor.continue();
    };
}
