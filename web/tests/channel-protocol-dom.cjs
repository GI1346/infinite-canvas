require("./interaction-dom.cjs");
window.matchMedia = () => ({ matches: false, media: "", onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
globalThis.ShadowRoot = window.ShadowRoot;
globalThis.SVGElement = window.SVGElement;
globalThis.HTMLBodyElement = window.HTMLBodyElement;
globalThis.HTMLHtmlElement = window.HTMLHtmlElement;
globalThis.HTMLAnchorElement = window.HTMLAnchorElement;
globalThis.FileReader = window.FileReader;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const computed = globalThis.getComputedStyle;
globalThis.getComputedStyle = (element) => computed(element);
window.getComputedStyle = globalThis.getComputedStyle;
// jsdom 没有实现 Range 的布局测量，文本框/选区相关的组件会直接调用。
const emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return this; } });
if (window.Range) {
    window.Range.prototype.getBoundingClientRect = emptyRect;
    window.Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
}
