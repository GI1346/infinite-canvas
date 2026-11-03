import assert from "node:assert/strict";
import localforage from "localforage";
import { cleanupUnusedMedia, getMediaBlob, resolveMediaUrl, setMediaBlob } from "../src/services/file-storage";

async function main() {
    const logs = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
    const revoked: string[] = [], originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => { revoked.push(url); originalRevoke(url); };
    try {
        const historyUrl = await setMediaBlob("video:history", new Blob(["video"], {type: "video/mp4"}));
        const referenceUrl = await setMediaBlob("audio:reference", new Blob(["audio"], {type: "audio/wav"}));
        const liveUrl = await setMediaBlob("audio:undo", new Blob(["undo"], {type: "audio/wav"}));
        const orphanUrl = await setMediaBlob("video:orphan", new Blob(["unused"], {type: "video/mp4"}));
        await logs.setItem("history", { video: {storageKey: "video:history", url: ""}, references: [{storageKey: "audio:reference"}] });
        await cleanupUnusedMedia({ history: [{nodes: [{metadata: {storageKey: "audio:undo"}}]}] });
        assert.ok(await getMediaBlob("video:history"));
        assert.ok(await getMediaBlob("audio:reference"));
        assert.ok(await getMediaBlob("audio:undo"));
        assert.equal(await getMediaBlob("video:orphan"), null);
        assert.deepEqual(revoked, [orphanUrl]);
        assert.equal(await resolveMediaUrl("video:orphan", "missing"), "missing", "清理须同时清除缓存 URL");
        assert.equal(await resolveMediaUrl("video:history"), historyUrl);
        assert.equal(await resolveMediaUrl("audio:reference"), referenceUrl);
        assert.equal(await resolveMediaUrl("audio:undo"), liveUrl);
        await logs.removeItem("history");
        await cleanupUnusedMedia({nodes: [{metadata: {storageKey: "audio:undo"}}]});
        assert.equal(await getMediaBlob("video:history"), null);
        assert.equal(await getMediaBlob("audio:reference"), null);
        assert.ok(await getMediaBlob("audio:undo"));
        assert.ok(revoked.includes(historyUrl)); assert.ok(revoked.includes(referenceUrl)); assert.ok(!revoked.includes(liveUrl));
        console.log("PASS: 视频历史结果/音频引用/撤销历史保留；真正无引用文件删除并释放缓存 Blob URL；共享引用不中断");
    } finally { URL.revokeObjectURL = originalRevoke; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });