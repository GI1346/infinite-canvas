require("./interaction-dom.cjs");
globalThis.FileReader = window.FileReader;
globalThis.Image = window.Image;
globalThis.ShadowRoot = window.ShadowRoot;
globalThis.SVGElement = window.SVGElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.NodeFilter = window.NodeFilter;
globalThis.HTMLInputElement = window.HTMLInputElement;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
