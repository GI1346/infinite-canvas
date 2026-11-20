import assert from "node:assert/strict";
import localforage from "localforage";
import { cleanResourceStorage } from "../src/services/resource-cleanup";
import { flushCanvasStorage, useCanvasStore, type CanvasProject } from "../src/stores/canvas/use-canvas-store";
import { startCanvasImageTask, useGenerationRunnerStore } from "../src/stores/canvas/use-generation-runner-store";
import { useAssetStore } from "../src/stores/use-asset-store";

const db = (storeName: string) => localforage.createInstance({ name: "infinite-canvas", storeName });
const canvasKey = "infinite-canvas:canvas_store", assetKey = "infinite-canvas:asset_store", galleryKey = "blinkflow:pose-gallery-cache-v1";
const state = db("app_state"), files = db("image_files"), previews = db("image_previews"), media = db("media_files"), images = db("image_generation_logs"), videos = db("video_generation_logs"), chats = db("canvas_assistant"), tasks = db("relay_tasks"), diagnostics = db("diagnostic_logs"), models = db("channel_model_catalogs");
const inline = "data:image/png;base64,AAAA", orphanInline = "data:image/png;base64,BBBB";
const node = (id: string, storageKey?: string, content?: string) => ({ id, type: "image", title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { storageKey, content, model: "example::image" } });
const project = (id: string, nodes: CanvasProject["nodes"]): CanvasProject => ({ id, title: id, createdAt: "now", updatedAt: "now", nodes, connections: [], chatSessions: [], activeChatId: null, backgroundMode: "dots", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
const projects = [project("a", [node("a", "image:used-a"), node("awaiting", "image:no-original")]), project("b", [node("b", "image:used-b"), node("inline", undefined, inline), { ...node("audio", "audio:used"), type: "audio" }])];
projects[1].chatSessions = [{ id: "chat", title: "chat", createdAt: "now", updatedAt: "now", messages: [{ id: "m", role: "user", text: "see", references: [{ id: "ref", type: "image", title: "picture", storageKey: "image:chat" }] }] }];
const tombstones = [{ id: "deleted", deletedAt: "now" }];
const stored = (data: unknown) => JSON.stringify({ state: data, version: 0 });
const savedAsset = (id: string, storageKey: string) => ({ id, kind: "image", data: { storageKey }, coverUrl: "" });

async function main() {
    await Promise.all([useCanvasStore.persist.rehydrate(), useAssetStore.persist.rehydrate()]);
    useCanvasStore.getState().replaceProjects(projects, tombstones);
    await flushCanvasStorage();
    const protectedEntries = {
        "infinite-canvas:ai_config_store": stored({ config: { channels: [{ id: "example", baseUrl: "https://relay.invalid", apiKey: "fixture-only" }], imageModel: "example::image" } }),
        "infinite-canvas:theme_store": stored({ theme: "dark" }),
        "infinite-canvas:canvas_image_settings": stored({ settings: { model: "example::image", imageResolution: "2k" } }),
    };
    for (const [key, value] of Object.entries(protectedEntries)) { localStorage.setItem(key, value); await state.setItem(key, value); }
    await models.setItem("example", ["example::image"]);
    const verifyProtected = async () => {
        for (const [key, value] of Object.entries(protectedEntries)) { assert.equal(localStorage.getItem(key), value); assert.equal(await state.getItem(key), value); }
        assert.deepEqual(await models.getItem("example"), ["example::image"]);
    };
    for (const key of ["image:used-a", "image:used-b", "image:chat", "image:deleted", "image:unused"]) {
        await files.setItem(key, new Blob([key]));
        await previews.setItem(key, { version: 1, blob: new Blob([key]) });
    }
    await previews.setItem("image:no-original", { version: 1, blob: new Blob(["orphan"]) });
    await media.setItem("audio:used", new Blob(["use"])); await media.setItem("audio:unused", new Blob(["remove"]));
    await state.setItem(assetKey, stored({ assets: [savedAsset("used", "image:used-a"), savedAsset("unused", "image:unused"), { id: "workflow", kind: "text", coverUrl: orphanInline, metadata: { workflow: { nodes: [node("copy", "image:unused", orphanInline)], connections: [] } } }] }));
    await state.setItem(galleryKey, { pose: ["online index"] });
    await images.setItem("mixed", { id: "mixed", projectId: "a", images: [{ storageKey: "image:used-a" }, { storageKey: "image:unused" }, { dataUrl: inline }, { dataUrl: orphanInline }], references: [{ storageKey: "image:chat" }, { storageKey: "image:deleted" }] });
    await images.setItem("deleted", { id: "deleted", projectId: "deleted", images: [{ storageKey: "image:used-a" }] });
    await videos.setItem("unused", { id: "unused", video: { storageKey: "audio:unused" } });
    await chats.setItem("a", { messages: ["keep"] }); await chats.setItem("deleted", { messages: ["remove"] });
    await tasks.setItem("task", { id: "task" }); await diagnostics.setItem("diagnostic", { id: "diagnostic" });

    const confirmed = useCanvasStore.getState().projects;
    const task = startCanvasImageTask("a", "a", 1);
    await assert.rejects(cleanResourceStorage(confirmed), /后台任务/);
    useGenerationRunnerStore.getState().finishTask(task);
    await assert.rejects(cleanResourceStorage([]), /发生变化|已变化/);
    await state.setItem(canvasKey, stored({ projects: [project("another-tab", []), ...projects], deletedProjects: tombstones }));
    await assert.rejects(cleanResourceStorage(confirmed), /尚未同步/);
    assert.equal(await files.length(), 5, "failed or stale requests must not delete anything");
    await flushCanvasStorage();
    const expectedProjects = JSON.parse(JSON.stringify(projects));
    await cleanResourceStorage(confirmed);
    assert.deepEqual(JSON.parse((await state.getItem<string>(canvasKey))!).state, { projects: expectedProjects, deletedProjects: [] });
    assert.deepEqual(useCanvasStore.getState().deletedProjects, []);
    for (const store of [files, previews]) assert.deepEqual((await store.keys()).sort(), ["image:chat", "image:used-a", "image:used-b"]);
    assert.deepEqual(await media.keys(), ["audio:used"]);
    assert.deepEqual(await chats.keys(), ["a"]);
    assert.deepEqual(await images.getItem("mixed"), { id: "mixed", projectId: "a", images: [{ storageKey: "image:used-a" }, { dataUrl: inline }], references: [{ storageKey: "image:chat" }] });
    assert.deepEqual(await images.keys(), ["mixed"]);
    assert.equal(await videos.length(), 0);
    const assets = JSON.parse((await state.getItem<string>(assetKey))!).state.assets;
    assert.deepEqual(assets.map(({ id }: { id: string }) => id), ["used", "workflow"]);
    assert.equal(assets[1].metadata.workflow.nodes[0].metadata.content, "");
    assert.equal(assets[1].metadata.workflow.nodes[0].metadata.model, "example::image");
    assert(await state.getItem(galleryKey));
    await verifyProtected();

    useCanvasStore.getState().replaceProjects([], tombstones);
    await flushCanvasStorage();
    await cleanResourceStorage(useCanvasStore.getState().projects);
    for (const store of [files, previews, media, images, videos, chats, tasks, diagnostics]) assert.equal(await store.length(), 0);
    assert.equal(await state.getItem(assetKey), null); assert.equal(await state.getItem(galleryKey), null);
    assert.deepEqual(JSON.parse((await state.getItem<string>(canvasKey))!).state, { projects: [], deletedProjects: [] });
    await verifyProtected();
    console.log("PASS resource cleanup: both scopes, stale and busy safeguards, original and inline references, history, and byte-for-byte preserved settings");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
