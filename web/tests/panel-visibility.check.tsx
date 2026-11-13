import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { CanvasNode } from "../src/components/canvas/canvas-node";
import { registerNodeDefinitions } from "../src/lib/canvas/node-registry";
import { shouldShowNodePanel, showsGenerationPanel } from "../src/lib/canvas/canvas-node-panel-visibility";
import type { CanvasNodeData } from "../src/types/canvas";

const no = () => {};
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
let passed = 0;
async function test(name: string, work: () => unknown | Promise<unknown>) {
    await work();
    console.log(`PASS ${name}`);
    passed += 1;
}

const node = (id: string, type: string, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata,
});

const state = (over: Partial<{ selected: boolean; selectedCount: number; dialogNodeId: string | null; blocked: boolean }> = {}) => ({
    selected: true,
    selectedCount: 1,
    dialogNodeId: null,
    blocked: false,
    ...over,
});

async function main() {
    await test("空图片节点算生成节点，上传的图片不算", () => {
        assert.equal(showsGenerationPanel(node("empty", "image")), true);
        assert.equal(showsGenerationPanel(node("upload", "image", { content: "blob:x" })), false);
    });

    await test("结果图带生成参数才弹配置窗", () => {
        assert.equal(showsGenerationPanel(node("result", "image", { content: "blob:x", model: "gpt-image-1" })), true);
        assert.equal(showsGenerationPanel(node("result2", "image", { content: "blob:x", generationType: "image" })), true);
        assert.equal(showsGenerationPanel(node("result3", "image", { content: "blob:x", prompt: "猫" })), true);
    });

    await test("文本、表格、并发、视频、音频节点都不弹", () => {
        for (const type of ["text", "dxos:table", "dxos:concurrent", "video", "audio"]) {
            assert.equal(showsGenerationPanel(node(type, type)), false, type);
            assert.equal(shouldShowNodePanel(node(type, type), state()), false, type);
        }
    });

    await test("单选生成节点展开，多选立即收起", () => {
        const image = node("g", "image", { model: "m" });
        assert.equal(shouldShowNodePanel(image, state()), true);
        assert.equal(shouldShowNodePanel(image, state({ selectedCount: 2 })), false);
        assert.equal(shouldShowNodePanel(image, state({ selected: false })), false);
        assert.equal(shouldShowNodePanel(image, state({ blocked: true })), false);
    });

    await test("插件面板只能由自身 openPanel 打开，单击选中不弹", () => {
        registerNodeDefinitions([{ type: "plug:x", title: "插件节点", Panel: () => null } as never], "plug");
        const plugin = node("p", "plug:x");
        assert.equal(shouldShowNodePanel(plugin, state()), false);
        assert.equal(shouldShowNodePanel(plugin, state({ dialogNodeId: "p" })), true);
        assert.equal(shouldShowNodePanel(plugin, state({ dialogNodeId: null })), false);
    });

    // 真实渲染：以前 showPanel 为真时还会被节点注册表的 Panel 拦掉，这里锁住该回归。
    await test("CanvasNode 在 showPanel 时渲染下方面板", async () => {
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        const image = node("render", "image", { model: "m", prompt: "画一只猫" });
        const render = async (showPanel: boolean) => {
            await act(async () => {
                root.render(
                    <CanvasNode
                        data={image}
                        scale={1}
                        isSelected={showPanel}
                        isConnectionTarget={false}
                        isConnecting={false}
                        showPanel={showPanel}
                        showImageInfo={false}
                        pluginHost={null}
                        registryVersion={0}
                        renderPanel={() => <div data-test-panel="ok" />}
                    />,
                );
                await tick();
            });
        };
        try {
            await render(true);
            const panel = host.querySelector<HTMLElement>("[data-node-panel]");
            assert.ok(panel, "panel wrapper missing");
            assert.ok(panel.querySelector("[data-test-panel]"), "panel content missing");
            // The panel lives in the canvas world (pans with the node, scales with zoom)
            // with a fixed canvas-unit size and no counter-scaling transform.
            assert.equal(panel.style.width, "1700px", "panel width must be fixed in canvas units");
            assert.equal(panel.style.height, "1000px", "panel height must be fixed in canvas units");
            assert.ok(panel.className.includes("absolute"), "panel must be anchored under the node");
            assert.ok(!panel.style.transform.includes("scale("), "panel must scale with the canvas, no counter-scale");
            await render(false);
            assert.equal(host.querySelector("[data-node-panel]"), null);
        } finally {
            await act(async () => root.unmount());
            host.remove();
        }
    });

    console.log(`panel-visibility: ${passed} passed`);
}

void main();
