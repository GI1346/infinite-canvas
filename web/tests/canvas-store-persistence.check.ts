import assert from "node:assert/strict";
import localforage from "localforage";
import { useCanvasStore, flushCanvasStorage } from "../src/stores/canvas/use-canvas-store";
import type { CanvasNodeData } from "../src/types/canvas";

async function main() {
    await useCanvasStore.persist.rehydrate();
    const store = useCanvasStore.getState();
    const id = store.createProject("原有字段保留");
    const node = (id: string): CanvasNodeData => ({ id, type: "image", title: id, position: { x: 0, y: 0 }, width: 10, height: 10 });
    store.updateProject(id, (project) => ({ nodes: [...project.nodes, node("first")] }));
    store.updateProject(id, (project) => ({ nodes: [...project.nodes, node("second")] }));
    assert.deepEqual(store.openProject(id)?.nodes.map((node) => node.id), ["first", "second"]);
    assert.equal(store.openProject(id)?.title, "原有字段保留");
    assert.equal(store.openProject(id)?.backgroundMode, "lines");
    await flushCanvasStorage();
    const db = localforage.createInstance({ name: "infinite-canvas", storeName: "app_state" });
    const key = "infinite-canvas:canvas_store";
    const valid = (await db.getItem<string>(key))!;
    const invalid = ["{broken", "null", JSON.stringify({ state: { projects: null, deletedProjects: [] }, version: 0 }), JSON.stringify({ ...JSON.parse(valid), version: 999 })];
    for (const raw of invalid) {
        await db.setItem(key, raw);
        await useCanvasStore.persist.rehydrate();
        assert.equal(useCanvasStore.getState().hydrated, false);
        assert.ok(useCanvasStore.getState().hydrationError);
        useCanvasStore.setState({ projects: [] });
        await new Promise((resolve) => setTimeout(resolve, 450));
        assert.equal(await db.getItem(key), raw, "失败回调与防抖保存不能覆盖损坏或未知版本原文");
        await assert.rejects(flushCanvasStorage(), /不能覆盖/);
        await db.setItem(key, valid);
        await useCanvasStore.persist.rehydrate();
        assert.equal(useCanvasStore.getState().hydrated, true);
        assert.equal(useCanvasStore.getState().hydrationError, null);
        assert.equal(useCanvasStore.getState().projects[0].nodes.length, 2);
    }
    await flushCanvasStorage();
    console.log("PASS: 函数式更新保留并发结果与现有字段；损坏 JSON/无效结构/未知版本保留原文并阻止自动及显式覆盖；恢复有效存储后正常加载");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });