require("./node-storage.cjs");
require("fake-indexeddb/auto");
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener: () => {} };
