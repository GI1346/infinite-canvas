import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import { compressReferenceImages } from "../src/lib/canvas/reference-image-compression";
import { CanvasConfigNodePanel } from "../src/components/canvas/canvas-config-node-panel";
import { InfiniteCanvas } from "../src/components/canvas/infinite-canvas";
import { requestEdit } from "../src/services/api/image";
import { defaultConfig, encodeChannelModel, useConfigStore } from "../src/stores/use-config-store";
import { dataUrlToFile, getDataUrlByteSize } from "../src/lib/image-utils";
import { assistantRunMode } from "../src/services/api/canvas-assistant";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { ReferenceImage } from "../src/types/image";
import "../src/styles/globals.css";

const results: Array<Record<string, unknown>> = [];
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const tick = () => new Promise(resolve => setTimeout(resolve, 35));
async function dimensions(image: ReferenceImage) { const file = dataUrlToFile(image), bitmap = await createImageBitmap(file); const size = { width: bitmap.width, height: bitmap.height, bytes: file.size }; bitmap.close(); return size; }
function fixture() {
    const canvas = document.createElement("canvas"); canvas.width = 4608; canvas.height = 2304;
    const context = canvas.getContext("2d")!, pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255; pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255; }
    context.putImageData(pixels, 0, 0);
    return { id: "original", name: "fixture.jpg", type: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.98), storageKey: "original-not-overwritten", url: "https://unused-original.test/image.jpg" };
}
const model = encodeChannelModel("offline", "gpt-image-1");
const config = { ...defaultConfig, model, imageModel: model, size: "1024x1024", count: "1", channels: [{ id: "offline", name: "offline", baseUrl: "https://offline-image.test", apiKey: "fixture-only", apiFormat: "openai" as const, models: [{ name: "gpt-image-1", capability: "image" as const }] }] };
useConfigStore.setState({ config });
let panel: CanvasNodeData = { id: "config", type: CanvasNodeType.Config, title: "生成配置", width: 540, height: 440, position: { x: 0, y: 0 }, metadata: { composerContent: "离线检查" } };
function UI() {
    const [, update] = useState(0), containerRef = React.useRef<HTMLDivElement>(null);
    return <InfiniteCanvas containerRef={containerRef} viewport={{ x: 0, y: 0, k: 1 }} tool="select" onViewportChange={() => {}}><div data-node-id="config" style={{ width: 540, height: 440 }}><CanvasConfigNodePanel node={panel} nodes={[panel]} inputs={[]} connectedNodes={[]} isRunning={false} onConfigChange={(_, patch) => { panel = { ...panel, metadata: { ...panel.metadata, ...patch } }; update(n => n + 1); }} onGenerate={() => { throw Error("No paid API permitted"); }} onStop={() => {}} onDisconnectReference={() => {}} onStartReferenceSelection={() => {}} /></div></InfiniteCanvas>;
}
async function main() {
    createRoot(document.getElementById("root")!).render(<UI />); await tick();
    const toggle = () => document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="图片压缩"]')!;
    const limit = document.querySelector<HTMLInputElement>('[aria-label="压缩单图上限 MB"]')!, edge = document.querySelector<HTMLSelectElement>('[aria-label="压缩最长边"]')!;
    assert(toggle().getAttribute("aria-checked") === "false" && limit.value === "1" && edge.value === "2k" && limit.disabled, "off defaults and disabled controls");
    toggle().click(); await tick(); assert(panel.metadata?.imageCompressionEnabled === true && !limit.disabled, "slider enables persisted metadata");
    edge.value = "4k"; edge.dispatchEvent(new Event("change", { bubbles: true })); await tick(); assert(panel.metadata?.imageCompressionResolution === "4k", "long edge persisted");
    toggle().click(); await tick(); assert(toggle().getAttribute("aria-checked") === "false" && edge.value === "4k", "off preserves selected settings");
    const bounds = document.querySelector('[data-image-compression]')!.getBoundingClientRect(); assert(bounds.height > 60 && bounds.bottom <= 441, "controls visible in existing config height");
    results.push({ check: "slider, defaults, selection, persistence, off state and visible layout", bounds: { height: bounds.height, bottom: bounds.bottom } });
    assert(assistantRunMode(panel) === "image", "both assistants can select config image runner");
    const original = fixture(), originals = [original], saved = JSON.stringify(original);
    assert(await compressReferenceImages(originals, { imageCompressionEnabled: false, imageCompressionMaxMb: 0 }) === originals, "disabled bypasses decode and validation");
    const impossible = [{ ...original, dataUrl: "invalid" }]; assert(await compressReferenceImages(impossible) === impossible, "absent setting does no work");
    for (const [resolution, expected] of [["1k", 1024], ["2k", 2048], ["4k", 4096]] as const) {
        const [output] = await compressReferenceImages(originals, { imageCompressionEnabled: true, imageCompressionResolution: resolution, imageCompressionMaxMb: 64 });
        const size = await dimensions(output); assert(Math.max(size.width, size.height) === expected && size.width === size.height * 2, resolution + " exact long edge and ratio");
        assert(!output.storageKey && !output.url, "compressed request cannot reuse old upload URL or storage file"); results.push({ check: resolution + " actual pixels", ...size });
    }
    const [budget] = await compressReferenceImages(originals, { imageCompressionEnabled: true, imageCompressionResolution: "4k", imageCompressionMaxMb: 0.15 });
    const budgetSize = await dimensions(budget); assert(budgetSize.bytes <= 0.15 * 1024 * 1024 && budgetSize.width <= 4096, "custom MB is real binary size"); results.push({ check: "0.15 MB actual file", ...budgetSize });
    const [defaults] = await compressReferenceImages(originals, { imageCompressionEnabled: true }); const defaultSize = await dimensions(defaults); assert(defaultSize.bytes <= 1048576 && defaultSize.width <= 2048, "2K / 1MB actual defaults"); results.push({ check: "2K / 1MB defaults", ...defaultSize });
    const canvas = document.createElement("canvas"); canvas.width = 1800; canvas.height = 900; canvas.getContext("2d")!.fillRect(0, 0, 900, 900);
    const alpha = { id: "alpha", name: "alpha.png", type: "image/png", dataUrl: canvas.toDataURL() };
    const [transparent] = await compressReferenceImages([alpha], { imageCompressionEnabled: true, imageCompressionResolution: "1k" });
    const bitmap = await createImageBitmap(dataUrlToFile(transparent)); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d")!.drawImage(bitmap, 0, 0); bitmap.close();
    assert(transparent.type === "image/png" && canvas.getContext("2d")!.getImageData(canvas.width - 1, 0, 1, 1).data[3] === 0, "PNG transparency preserved");
    assert((await compressReferenceImages([budget], { imageCompressionEnabled: true, imageCompressionResolution: "4k", imageCompressionMaxMb: 1 }))[0] === budget, "already compliant image bytes preserved");
    const abort = new AbortController(); abort.abort(); let aborted = false; try { await compressReferenceImages(originals, { imageCompressionEnabled: true }, abort.signal); } catch (error) { aborted = (error as Error).name === "AbortError"; } assert(aborted, "compression respects cancellation");
    let requests = 0;
    const adapter = axios.defaults.adapter;
    axios.defaults.adapter = async request => {
        requests++; let image: ReferenceImage;
        if (request.data instanceof FormData) {
            const file = request.data.get("image") as File; assert(file instanceof File, "multipart real File");
            image = { id: "sent", name: file.name, type: file.type, dataUrl: await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); }) };
        } else {
            const payload = JSON.parse(String(request.data)); const inline = payload.contents[0].parts.find((part: any) => part.inlineData)?.inlineData; assert(inline, "Gemini real inlineData"); image = { id: "sent", name: "gemini.jpg", type: inline.mimeType, dataUrl: `data:${inline.mimeType};base64,${inline.data}` };
        }
        const size = await dimensions(image);
        if (requests === 1) { assert(image.dataUrl === original.dataUrl, "OFF multipart exact original bytes"); }
        else { assert(size.bytes <= 1048576 && Math.max(size.width, size.height) <= 1024, "ON actual API body constrained"); }
        results.push({ check: "actual " + (requests < 3 ? "OpenAI multipart " : "Gemini inlineData ") + (requests === 1 ? "OFF" : "ON"), ...size });
        return { config: request, status: 200, statusText: "OK", headers: {}, data: requests < 3 ? { data: [{ b64_json: "AA==" }] } : { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AA==" } }] } }] } };
    };
    try {
        await requestEdit(config, "test", originals, { imageCompression: { imageCompressionEnabled: false } });
        const settings = { imageCompressionEnabled: true, imageCompressionResolution: "1k" as const, imageCompressionMaxMb: 1 };
        await requestEdit(config, "test", originals, { imageCompression: settings });
        await requestEdit({ ...config, channels: [{ ...config.channels[0], apiFormat: "gemini" }] }, "test", originals, { imageCompression: settings });
        let rejected = false; try { await requestEdit(config, "test", originals, { imageCompression: { imageCompressionEnabled: true, imageCompressionMaxMb: 0 } }); } catch { rejected = true; }
        assert(rejected && requests === 3, "invalid limit stopped before network");
    } finally { axios.defaults.adapter = adapter; }
    assert(JSON.stringify(original) === saved, "original canvas reference untouched");
    results.push({ check: "transparent PNG, compliant bypass, cancellation, invalid-limit guard, original protection and no paid calls", originalBytes: getDataUrlByteSize(original.dataUrl) });
    return results;
}
(window as any).__compressionCheck = main().then(results => ({ ok: true, results }), error => ({ ok: false, error: String(error?.stack || error), results }));