import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { App, ConfigProvider } from "antd";
import { ChannelEditorDrawer } from "../src/components/layout/channel-editor-drawer";
import { AppConfigPanel } from "../src/components/layout/app-config-modal";
import { defaultConfig, createModelChannel, useConfigStore, type ModelChannel } from "../src/stores/use-config-store";
import { useCallProtocolStore } from "../src/stores/use-call-protocol-store";

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
async function fire(target: EventTarget, type: string) { await act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })); await tick(); }); }
const click = (target: EventTarget) => fire(target, "click");
const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
let saved: ModelChannel | undefined;
async function render(channel: ModelChannel) { await act(async () => { root.render(<ConfigProvider virtual={false}><App><ChannelEditorDrawer open channel={channel} onSave={(value) => { saved = value; }} onClose={() => {}} /></App></ConfigProvider>); await tick(); }); }
async function select(name: string, label: string) {
    const input = document.querySelector(`[aria-label="${name}"]`); assert(input, name);
    await fire(input.closest(".ant-select")!, "mousedown");
    const option = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')].find((item) => item.getAttribute("title") === label || item.textContent === label);
    assert(option, `${label}; available: ${[...document.querySelectorAll('.ant-select-item-option')].map((item) => item.textContent).join(', ')}`); await click(option);
}
async function save() { const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.replace(/\s+/g, "") === "保存"); assert(button, [...document.querySelectorAll("button")].map((item) => item.textContent).join(', ')); await click(button); assert(saved); return saved!; }
async function main() {
    await useCallProtocolStore.persist.rehydrate();
    useCallProtocolStore.setState({ protocols: [
        { format: "canvas-call/v1", id: "custom-image", label: "我的异步生图", capability: "image", script: "return [];" },
        { format: "canvas-call/v1", id: "custom-text", label: "我的聊天协议", capability: "text", script: "return 'text';" },
    ] });
    const channel = createModelChannel({ ...defaultConfig.channels[0], baseUrl: "https://relay.invalid", apiKey: "synthetic-channel-key", models: [{ name: "image-default", capability: "image" }, { name: "model-override", capability: "image", protocolId: "custom-image" }] });
    await render(channel);
    assert(!document.querySelector('[aria-label="原生异步任务地址"]'));
    assert(document.querySelector('[aria-label="渠道调用协议"]')?.closest(".ant-select")?.textContent?.includes("OpenAI"));
    await select("渠道调用协议", "我的异步生图（生图）");
    assert(!document.querySelector('[aria-label="原生异步任务地址"]'));
    const custom = await save(); assert.equal(custom.protocolId, "custom-image"); assert.equal(custom.baseUrl, channel.baseUrl); assert.equal(custom.apiKey, channel.apiKey);
    assert.equal(custom.models[0].protocolId, undefined); assert.equal(custom.models[1].protocolId, "custom-image");
    console.log("PASS: channel dropdown lists custom protocols, saves channel inheritance and preserves model override");
    await select("渠道调用协议", "OpenAI");
    const openai = await save(); assert.equal(openai.protocolId, undefined); assert.equal(openai.baseUrl, channel.baseUrl); assert.equal(openai.apiKey, channel.apiKey);
    assert(!document.querySelector('[aria-label="原生异步任务地址"]'));
    console.log("PASS: choosing OpenAI explicitly disables preset native-task routing without modifying models or credentials");
    await fire(document.querySelector('[aria-label="渠道调用协议"]')!.closest(".ant-select")!, "mousedown");
    assert(![...document.querySelectorAll('.ant-select-item-option')].some((option) => option.textContent?.includes("65535")));
    console.log("PASS: built-in native-task protocol and second URL are absent");
    await render({ ...channel, protocolId: "removed-protocol" });
    assert(document.querySelector('[aria-label="渠道调用协议"]')?.closest(".ant-select")?.textContent?.includes("缺失：removed-protocol"));
    console.log("PASS: deleted channel protocol remains visibly missing, no silent default replacement");
    await act(async () => {
        useConfigStore.setState({ config: { ...defaultConfig, channels: [channel, { ...channel, id: "custom", name: "custom", protocolId: "custom-image" }, { ...channel, id: "missing", name: "missing", protocolId: "removed" }] } });
        root.render(<ConfigProvider><App><AppConfigPanel /></App></ConfigProvider>); await tick();
    });
    const text = host.textContent || "";
    assert(!text.includes("65535 原生异步任务")); assert(text.includes("OpenAI")); assert(text.includes("我的异步生图")); assert(text.includes("缺失：removed"));
    console.log("PASS: channel list shows standard/custom/missing protocol labels rather than misleading OpenAI");
    await act(async () => root.unmount()); host.remove();
}
main().then(() => process.exit(0)).catch(async (error) => { console.error(error); await act(async () => root.unmount()); host.remove(); process.exit(1); });
