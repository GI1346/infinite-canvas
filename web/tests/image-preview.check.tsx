import assert from "node:assert/strict";
import React, { act, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/i18n";
import { InfiniteCanvas } from "../src/components/canvas/infinite-canvas";
import { CanvasImagePreviewDialog } from "../src/components/canvas/canvas-image-preview-dialog";

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const fire = async (target: EventTarget, event: Event) => { await act(async () => { target.dispatchEvent(event); await tick(); }); };
const pointer = (type: string, extra = {}) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, button: 0, clientX: 200, clientY: 150, ...extra });
const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
let changed = 0, selected = 0, cuts = 0, close = 0;
const canvasRef = createRef<HTMLDivElement>();
const initial = { x: 12, y: 25, k: 0.8 };
async function render(open = true, source = "data:image/svg+xml,test") {
    await act(async () => {
        root.render(<InfiniteCanvas containerRef={canvasRef} tool="select" viewport={initial} onViewportChange={() => changed++} onCanvasMouseDown={() => selected++} onConnectionCutStart={() => { cuts++; return true; }}><CanvasImagePreviewDialog dataUrl={source} title="我的生成图片" open={open} onClose={() => close++} /></InfiniteCanvas>);
        await tick();
    });
}
const image = () => document.querySelector<HTMLImageElement>('[data-image-preview-media]')!;
const viewport = () => document.querySelector<HTMLDivElement>('[data-image-preview-viewport]')!;
function view() {
    const match = image().style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\).*scale\(([-\d.]+)\)/)!;
    return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
}
async function load(width = 1200, height = 800) {
    Object.defineProperty(image(), 'naturalWidth', { configurable: true, value: width });
    Object.defineProperty(image(), 'naturalHeight', { configurable: true, value: height });
    await fire(image(), new Event("load", { bubbles: false }));
}
async function wheel(deltaY: number) {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 200, clientY: 150, deltaY });
    await fire(image(), event); assert(event.defaultPrevented);
}
async function main() {
    await render(); await load();
    assert(document.querySelector('[data-canvas-overlay][data-canvas-no-zoom]'));
    assert.equal(document.querySelector('[data-image-resolution]')?.textContent, '1200 × 800 px');
    assert.equal(image().draggable, false); assert.equal(image().alt, '我的生成图片');
    assert.deepEqual(view(), { x: 0, y: 0, k: 1 });
    const before = view(); await wheel(-100); const enlarged = view();
    assert(enlarged.k > before.k);
    // 600x450 mocked viewport: pointer is (-100,-75) from center.
    assert(Math.abs((-100 - enlarged.x) / enlarged.k - (-100 - before.x) / before.k) < 1e-8);
    assert(Math.abs((-75 - enlarged.y) / enlarged.k - (-75 - before.y) / before.k) < 1e-8);
    await wheel(100); assert(Math.abs(view().k - 1) < 1e-8);
    // Rapid unbatched wheel events must accumulate using latest ref, not stale state.
    await act(async () => { for (let i = 0; i < 4; i++) viewport().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 })); await tick(); });
    assert(Math.abs(view().k - 1.1 ** 4) < 1e-8);
    const start = view();
    await fire(image(), pointer('pointerdown', { ctrlKey: true }));
    await fire(viewport(), pointer('pointermove', { clientX: 250, clientY: 180 }));
    assert.equal(view().x, start.x + 50); assert.equal(view().y, start.y + 30);
    await fire(viewport(), pointer('pointerup'));
    const stopped = view(); await fire(viewport(), pointer('pointermove', { clientX: 300 })); assert.deepEqual(view(), stopped);
    await fire(image(), pointer('pointerdown'));
    await fire(window, new Event('blur')); await fire(viewport(), pointer('pointermove', { clientX: 300 })); assert.deepEqual(view(), stopped);
    await fire(image(), pointer('pointerdown'));
    await fire(viewport(), pointer('pointercancel'));
    await fire(viewport(), pointer('pointermove', { clientX: 500 })); assert.deepEqual(view(), stopped);
    const fit = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('适应窗口'))!;
    await fire(fit, new MouseEvent('click', { bubbles: true })); assert.deepEqual(view(), { x: 0, y: 0, k: 1 });
    await wheel(100); assert(view().k < 1, 'can shrink from initial fit');
    await fire(image(), pointer('pointerdown')); await fire(viewport(), pointer('pointermove', { clientX: 270 })); await fire(viewport(), pointer('pointerup'));
    await render(true, 'data:image/svg+xml,second'); await load(900, 1600); assert.deepEqual(view(), { x: 0, y: 0, k: 1 });
    await wheel(-100); await render(false); await render(true); await load(); assert.deepEqual(view(), { x: 0, y: 0, k: 1 });
    await fire(image(), new Event('error')); assert(document.querySelector('[role="alert"]')?.textContent?.includes('加载失败'));
    await fire(document.querySelector('.ant-modal-close')!, new MouseEvent('click', { bubbles: true })); assert.equal(close, 1);
    assert.equal(changed, 0); assert.equal(selected, 0); assert.equal(cuts, 0); assert.equal((canvasRef.current as any).__capturedPointerId, undefined);
    const gallery = Array.from({ length: 52 }, (_, index) => ({ id: "image-" + index, title: "画布图片 " + (index + 1), content: "data:image/svg+xml," + index }));
    function Gallery() {
        const [index, setIndex] = useState(0);
        return <InfiniteCanvas containerRef={canvasRef} tool="select" viewport={initial} onViewportChange={() => changed++} onCanvasMouseDown={() => selected++} onConnectionCutStart={() => { cuts++; return true; }}>
            <CanvasImagePreviewDialog dataUrl={gallery[index].content} title={gallery[index].title} open onClose={() => close++} images={gallery} position={index + 1} total={gallery.length} onSelect={setIndex} onPrevious={() => setIndex(current => (current + 51) % 52)} onNext={() => setIndex(current => (current + 1) % 52)} />
        </InfiniteCanvas>;
    }
    await act(async () => { root.render(<Gallery />); await tick(); });
    const strip = document.querySelector<HTMLElement>("[data-image-preview-thumbnails]")!;
    const thumbnails = [...strip.querySelectorAll("button")];
    assert.equal(thumbnails.length, 52, "all canvas image entries are represented");
    thumbnails.forEach((button, index) => {
        Object.defineProperty(button, "offsetLeft", { configurable: true, value: index * 64 });
        Object.defineProperty(button, "offsetWidth", { configurable: true, value: 56 });
    });
    assert.equal(thumbnails[0].getAttribute("aria-current"), "true");
    await load(); await wheel(-100);
    await fire(thumbnails[51], new MouseEvent("click", { bubbles: true }));
    assert.equal(image().src, gallery[51].content); assert.equal(image().alt, gallery[51].title);
    assert.equal(strip.querySelectorAll('[aria-current="true"]').length, 1);
    assert.equal(thumbnails[51].getAttribute("aria-current"), "true");
    assert.equal(strip.scrollLeft, 51 * 64 + 56 - 600, "last thumbnail scrolls into view");
    assert.deepEqual(view(), { x: 0, y: 0, k: 1 }, "thumbnail selection resets previous image transform");
    const arrow = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    await fire(window, arrow); assert(arrow.defaultPrevented);
    assert.equal(image().src, gallery[0].content); assert.equal(strip.scrollLeft, 0, "right arrow wraps and reveals first thumbnail");
    await fire(window, new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    assert.equal(image().src, gallery[51].content); assert.equal(thumbnails[51].getAttribute("aria-current"), "true");
    await fire(document.querySelector('[aria-label="上一张图片"]')!, new MouseEvent("click", { bubbles: true }));
    assert.equal(image().src, gallery[50].content);
    await fire(document.querySelector('[aria-label="下一张图片"]')!, new MouseEvent("click", { bubbles: true }));
    assert.equal(image().src, gallery[51].content);
    assert.equal(changed, 0); assert.equal(selected, 0); assert.equal(cuts, 0);
    await act(async () => root.unmount());
    console.log('Image preview passed: cursor-anchored bidirectional/rapid zoom, left drag, Ctrl isolation, capture release, blur/cancel, reset, portrait/source change/reopen, error/close; 52 canvas thumbnails, click selection, keyboard/buttons, wraparound, selection-follow scrolling, source reset; zero background canvas mutation.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
