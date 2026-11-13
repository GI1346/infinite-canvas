import assert from "node:assert/strict";
import { canWriteClipboardImage, hasNativeClipboard, readClipboardImages, writeClipboard } from "../src/lib/clipboard";

// 桌面通道的契约：图片以 ArrayBuffer 过 IPC，文本同行；读回来是 PNG 字节。
const calls: Array<{ text?: string; png?: ArrayBuffer }> = [];
(globalThis as unknown as { window?: unknown }).window = {
    blinkflowClipboard: {
        write: async (payload: { text?: string; png?: ArrayBuffer }) => { calls.push(payload); return true; },
        read: async () => ({ text: "hello", png: new Uint8Array([137, 80, 78, 71]) }),
    },
};

assert.equal(hasNativeClipboard(), true);
assert.equal(canWriteClipboardImage(), true);

await writeClipboard({ png: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), text: "prompt" });
assert.equal(calls.length, 1);
assert.equal(calls[0].text, "prompt");
assert.ok(calls[0].png instanceof ArrayBuffer);
assert.deepEqual([...new Uint8Array(calls[0].png!)], [1, 2, 3]);

await writeClipboard({ text: "only text" });
assert.equal(calls[1].text, "only text");
assert.equal(calls[1].png, undefined);

const images = await readClipboardImages();
assert.equal(images.length, 1);
assert.equal(images[0].type, "image/png");
assert.equal(images[0].size, 4);

(globalThis as unknown as { window?: unknown }).window = {};
assert.equal(hasNativeClipboard(), false);
assert.deepEqual(await readClipboardImages(), []);

console.log("PASS clipboard bridge: image + text in one write, PNG read back, graceful web fallback");
