import { ConnectionCreateMenu } from "../src/components/canvas/canvas-create-menus";
import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import axios from "axios";
import "antd/dist/reset.css";
import "../src/styles/globals.css";
import "../src/i18n";
import { imageQualityOptions, imageQualityForModel } from "../src/lib/image-quality";
import { assistantImageParameters } from "../src/lib/canvas/assistant-image-parameters";
import { buildGenerationConfig } from "../src/lib/canvas/canvas-generation-helpers";
import { requestGeneration, requestEdit } from "../src/services/api/image";
import { CanvasConfigNodePanel } from "../src/components/canvas/canvas-config-node-panel";
import { dxosNodeDefinitions } from "../src/components/canvas/nodes/dxos-workflow-nodes";
import { useConfigStore, defaultConfig, encodeChannelModel } from "../src/stores/use-config-store";
import { canvasThemes } from "../src/lib/canvas-theme";
import { useThemeStore } from "../src/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import { NODE_DEFAULT_SIZE } from "../src/constant/canvas";
import { enlargeWorkflowNodes } from "../src/lib/canvas/workflow-display-size";
const results: string[] = [], seen: any[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const equal = (a: unknown, b: unknown, message: string) => check(JSON.stringify(a) === JSON.stringify(b), message + ": " + JSON.stringify({a,b}));
const tick = () => new Promise(r => setTimeout(r, 60));
const names = ["gpt-image-1", "gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare-native", "gpt-image-2.6-flare", "gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-nano-banana-2.1"];
const modelId = (name: string) => encodeChannelModel("offline", name);
const config = {...defaultConfig, proxyEnabled: false, model: modelId(names[2]), imageModel: modelId(names[2]), models: names.map(modelId), channels: [{ id: "offline", name: "offline", baseUrl: "https://offline.invalid", apiKey: "fixture-not-real", apiFormat: "openai" as const, models: names.map(name => ({name,capability: "image" as const})) }]};
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1cAAAAASUVORK5CYII=";
const host = document.getElementById("root")!, root = createRoot(host);
const node = (type = CanvasNodeType.Config): CanvasNodeData => ({id: "config", type, title: "fixture", position: {x:0,y:0}, ...NODE_DEFAULT_SIZE[type], metadata: {model:config.model,quality:"max",composerContent:"测试提示词与长文本输入\n第二行，字体保持24px。"}});
async function main() {
    delete window.blinkflowNetwork;
    useConfigStore.setState({config});
    axios.defaults.adapter = async request => {
        check(new URL(request.url!).hostname === "offline.invalid", "No real network");
        const data = request.data instanceof FormData ? Object.fromEntries(request.data.entries()) : typeof request.data === "string" ? JSON.parse(request.data) : request.data;
        seen.push({url:request.url, data});
        return {config:request,status:200,statusText:"OK",headers:{},data: request.url!.includes("generateContent") ? {candidates:[{content:{parts:[{inlineData:{mimeType:"image/png",data:pixel.split(",")[1]}}]}}]} : {data:[{b64_json:pixel.split(",")[1]}]}};
    };
    for (const name of names) {
        const model = modelId(name), options = imageQualityOptions(model), banana = /gemini/.test(name);
        check(banana ? options.length === 0 : options.includes("high"), "Model capabilities " + name);
        check(!options.includes("max") || /2\.[56]-/.test(name), "No unsupported max " + name);
        const quality = banana ? "max" : options.at(-1)!;
        await requestGeneration({...config,model,quality},"fixture");
        equal(seen.at(-1).data.quality,banana ? undefined : quality,"JSON quality " + name);
        await requestEdit({...config,model,quality},"fixture",[{id:"ref",name:"ref.png",type:"image/png",dataUrl:pixel}]);
        equal(seen.at(-1).data.quality,banana ? undefined : quality,"Multipart quality " + name);
        const normalized = assistantImageParameters({quality:"max",model},{},config);
        equal(normalized.quality,banana ? "auto" : options.at(-1),"Assistant highest " + name);
    }
    const before = seen.length;
    try { await requestGeneration({...config,model:modelId("gpt-image-2"),quality:"max"},"fixture"); throw Error("Invalid quality accepted"); } catch (error) { check(String(error).includes("不支持质量"), "Reject unsupported request"); }
    equal(seen.length,before,"Invalid quality rejected before network");
    for (const name of ["gpt-image-2.5-sunburst", "gemini-nano-banana-2.1"]) {
        const pluginConfig = {...config,model:modelId(name),quality:"max",channels:[{...config.channels[0],models:[{name,capability:"image" as const,script:`await http.post('/images/generations', params); return ['${pixel}'];`}]}]};
        await requestGeneration(pluginConfig,"fixture"); equal(seen.at(-1).data.quality,/gemini/.test(name) ? undefined : "max","Plugin generation " + name);
        await requestEdit(pluginConfig,"fixture",[{id:"ref",name:"ref.png",type:"image/png",dataUrl:pixel}]); equal(seen.at(-1).data.quality,/gemini/.test(name) ? undefined : "max","Plugin edit " + name);
    }
    const geminiConfig = {...config,model:modelId("gemini-3-pro-image"),quality:"max",imageResolution:"2k",size:"1152x2048",channels:[{...config.channels[0],apiFormat:"gemini" as const}]};
    await requestGeneration(geminiConfig,"fixture"); const gemini = seen.at(-1).data;
    equal(gemini.generationConfig.imageConfig,{aspectRatio:"9:16",imageSize:"2K"},"Native Gemini resolution preserved"); check(!JSON.stringify(gemini).includes('"quality"'),"Native Gemini no quality");
    results.push("21 actual request payloads checked: JSON, multipart, custom scripts, native Gemini; invalid GPT quality blocked before network");
    const newConfig=node(), oldConfig={...node(),width:540,height:440}, oldText={...node(CanvasNodeType.Text),width:340,height:240}, custom={...oldText,width:500,height:350};
    const migrated=enlargeWorkflowNodes([oldConfig,oldText,custom]); equal([migrated[0].width,migrated[0].height,migrated[1].width,migrated[1].height],[854,854,427,427],"Saved defaults migrated"); check(migrated[2]===custom,"Custom dimensions preserved"); equal(enlargeWorkflowNodes(migrated),migrated,"Migration idempotent");
    const stale=buildGenerationConfig(config,{...node(),metadata:{model:modelId("gpt-image-2"),quality:"max"}},"image"); equal(stale.quality,"auto","Stale invalid quality normalized");
    for (const name of names) {
        const n={...newConfig,metadata:{...newConfig.metadata,model:modelId(name)}};
        root.render(<ConfigProvider><div data-fixture style={{width:854,height:854}}><CanvasConfigNodePanel node={n} nodes={[n]} inputs={[]} connectedNodes={[]} isRunning={false} onConfigChange={()=>{}} onGenerate={()=>{}} onStop={()=>{}} onDisconnectReference={()=>{}} onStartReferenceSelection={()=>{}} /></div></ConfigProvider>); await tick();
        const select=document.querySelector<HTMLSelectElement>('[aria-label="生成配置质量"]')!, options=imageQualityOptions(modelId(name));
        equal(select.disabled,!options.length,"Config enabled follows model " + name); equal([...select.options].map(o=>o.value),options.length?options:["auto"],"Config options " + name);
        for(const selector of ['[aria-label="生成配置质量"]','[aria-label="生成配置比例"]','.canvas-composer-model-picker','[aria-label="生成配置提示词"]']) { const element=document.querySelector(selector); check(element,"Missing font selector " + selector); equal(getComputedStyle(element).fontSize,"24px","Real CSS font " + name); }
        check(!document.body.textContent?.includes("该模型不支持质量设置"),"No extra unsupported text");
        const panel=document.querySelector('[data-fixture]')!.firstElementChild! as HTMLElement;
        equal([panel.offsetWidth,panel.offsetHeight],[854,854],"Panel actual dimensions"); check(panel.scrollWidth<=panel.clientWidth&&panel.scrollHeight<=panel.clientHeight,"No config overflow");
    }
    results.push("Generation config: 8 models dynamically rerender, banana quality disabled/dim, GPT valid options, actual 24px fonts and 854x854 without overflow; text427x427 and saved/custom sizes checked");
    const Content=dxosNodeDefinitions.find(n=>n.type==="dxos:concurrent")!.Content!;
    for(const name of ["gpt-image-2.5-sunburst","gemini-3-pro-image","gpt-image-2"]) {
        const n={...node(),type:"dxos:concurrent",metadata:{model:modelId(name),quality:"max"}};
        const ctx:any={node:n,theme:canvasThemes[useThemeStore.getState().theme],getNodes:()=>[n],getConnections:()=>[],getNode:()=>n,updateMetadata:()=>{},ai:{listModels:()=>names.map(name=>({value:modelId(name),label:name}))}};
        root.render(<Content ctx={ctx}/>);await tick();const select=document.querySelector<HTMLSelectElement>('[aria-label="生成质量"]')!,options=imageQualityOptions(modelId(name));
        equal(select.disabled,!options.length,"Batch quality disabled " + name);equal([...select.options].map(o=>o.value),options.length?options:["auto"],"Batch quality options " + name);
    }
    results.push("Concurrent generation quality follows model and canvas default");
    equal(imageQualityForModel(modelId("gpt-image-2"),"max"),"auto","Switch resets unavailable stored value");
    let created="";
    root.render(<ConnectionCreateMenu pending={{position:{x:0,y:0},connection:{nodeId:"image",handleType:"source"}}} onCreate={type=>{created=type}} onClose={()=>{}}/>);await tick();
    const menu=document.querySelector('[data-connection-create-menu]')!,buttons=[...menu.querySelectorAll('button')].filter(button=>button.querySelector('span.min-w-0'));
    equal(buttons.map(button=>button.querySelector('span.min-w-0 > span')!.textContent),["文本","生成配置","多维表格","LLM 多模态分析","融合节点"],"Dragged connection menu order");
    buttons[0].click();equal(created,"text","First item creates text");check(menu.scrollWidth<=menu.clientWidth,"Dragged connection menu no overflow");
    results.push("Dragged connection menu: text first, click creates text, no horizontal overflow");
    root.unmount();return {ok:true,requests:seen.length,results};
}
(window as any).__modelQualityCheck=main().catch(error=>({ok:false,error:String(error.stack||error),results}));