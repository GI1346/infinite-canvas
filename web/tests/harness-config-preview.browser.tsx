window.addEventListener("unhandledrejection",e=>console.error("UNHANDLED",e.reason));
window.addEventListener("error",e=>console.error("PAGEERROR",e.message));
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "../src/styles/globals.css";
import "../src/i18n";
import { AppProviders } from "../src/components/layout/app-providers";
import CanvasPage from "../src/pages/canvas/project";
import { useCanvasStore } from "../src/stores/canvas/use-canvas-store";
import { useConfigStore, defaultConfig, encodeChannelModel } from "../src/stores/use-config-store";
import { useCanvasAssistantStore } from "../src/stores/use-canvas-assistant-store";
import { executeHarnessCanvasTool } from "../src/services/api/deepseek-harness";
import { relayChatScript } from "../src/services/api/relay-chat";
import { useThemeStore } from "../src/stores/use-theme-store";

function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const wait = async (predicate: () => unknown) => { for (let i=0; i<300; i++) { if (predicate()) return; await new Promise(r=>setTimeout(r,50)); } throw new Error("UI wait timed out: " + JSON.stringify({projectId,context:useCanvasAssistantStore.getState().context?.getSnapshot(),hydrated:useCanvasStore.getState().hydrated,projects:useCanvasStore.getState().projects.map(p=>({id:p.id,nodes:p.nodes.length})),body:document.body.innerText.slice(0,600)})); };
const paint = (width: number, height: number, label: string, color: string) => { const c=document.createElement("canvas"); c.width=width; c.height=height; const ctx=c.getContext("2d")!; ctx.fillStyle=color; ctx.fillRect(0,0,width,height); ctx.fillStyle="#ffffff"; ctx.font="bold " + Math.floor(width/10) + "px sans-serif"; ctx.fillText(label,width/12,height/2); return c.toDataURL("image/png"); };
const blobUrl = (data: string) => URL.createObjectURL(new Blob([Uint8Array.from(atob(data.split(",")[1]), c=>c.charCodeAt(0))],{type:"image/png"}));
const frames = () => new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
let projectId="", configId="", outputId="";
const outgoing: Record<string, unknown>[]=[];
const current = () => useCanvasAssistantStore.getState().context!.getSnapshot();
const call = (tool: string, args: Record<string, unknown>) => executeHarnessCanvasTool({id:crypto.randomUUID(),projectId,tool,args},new AbortController().signal);
const api = window as any;
api.__checkReady = (async () => {
    await Promise.all([useCanvasStore.persist.rehydrate(),useConfigStore.persist.rehydrate()]);
    window.blinkflowNetwork=undefined;
    const model=encodeChannelModel("offline", "gpt-image-2.5-sunburst");
    useConfigStore.setState({config:{...defaultConfig,proxyEnabled:false,imageModel:model,models:[model],channels:[{id:"offline",name:"验收离线接口",baseUrl:"https://offline-image.test",apiKey:"fixture-not-a-real-key",apiFormat:"openai",models:[{name:"gpt-image-2.5-sunburst",capability:"image"}]}]}});
    axios.defaults.adapter=async request=>{ check(new URL(request.url!).hostname==="offline-image.test", "Unexpected API host: "+request.url); check(request.url!.endsWith("/images/generations"),"Must use image generations"); const body=JSON.parse(request.data); outgoing.push(body); check(body.size==="1152x2048", "First request must use 9:16 2K pixels"); check(body.quality==="max","First request must use maximum quality"); return {config:request,status:200,statusText:"OK",headers:{},data:{data:[{b64_json:paint(1152,2048,"RESULT " + outgoing.length,"#24736b").split(",")[1]}]}}; };
    projectId=useCanvasStore.getState().createProject("Harness 生成配置与缩略图验收");
    useCanvasStore.getState().updateProject(projectId,{nodes:[{id:"source-text",type:"text",title:"小兔子提示词",position:{x:100,y:220},width:320,height:300,metadata:{content:"一只白色小兔子在草地上，电影摄影。",prompt:"一只白色小兔子在草地上，电影摄影。"}}, ...Array.from({length:52},(_,i)=>({id:"gallery-"+i,type:"image",title:"画布图片 "+(i+1),position:{x:4000+i*300,y:100},width:200,height:200,metadata:{content:blobUrl(paint(128,128,String(i+1),"hsl("+i*7+",50%,40%)")),status:"success" as const,naturalWidth:128,naturalHeight:128}}))],viewport:{x:0,y:0,k:0.65}});
    document.body.style.fontFamily='"Microsoft YaHei",sans-serif';
    createRoot(document.getElementById("root")!).render(<AppProviders><MemoryRouter initialEntries={["/canvas/"+projectId]}><Routes><Route path="/canvas/:id" element={<CanvasPage/>}/></Routes></MemoryRouter></AppProviders>);
    await wait(()=>useCanvasAssistantStore.getState().context?.getSnapshot().nodes.some(n=>n.id==="source-text"));
    return true;
})();
api.runHarnessCheck = async () => {
    await api.__checkReady;
    const original=JSON.stringify(current().nodes.find(n=>n.id==="source-text")!.metadata);
    const created:any=await call("apply_workflow",{nodes:[{key:"generator",type:"image",title:"2K 竖图 · 最高质量",parameters:{quality:"high",imageResolution:"1k"}}],sourceNodeIds:["source-text"],connections:[]});
    configId=created.value.resolvedNodes[0].id;
    check(current().nodes.find(n=>n.id===configId)?.type==="config","Legacy workflow image must become real config");
    check(current().connections.some(e=>e.fromNodeId==="source-text"&&e.toNodeId===configId),"Text must connect to config");
    const first:any=await call("run_nodes",{nodeIds:[configId],requirements:"生成图片，2K，9:16，质量最高"});
    check(first.value.ok, JSON.stringify(first)); outputId=first.value.outcomes[0].id;
    check(outputId!==configId,"Result must be a new image node");
    const output=current().nodes.find(n=>n.id===outputId)!;
    check(output.type==="image"&&output.metadata?.status==="success","Real native runner must produce image");
    check(output.metadata?.naturalWidth===1152&&output.metadata?.naturalHeight===2048,"Decoded output dimensions");
    check(current().connections.some(e=>e.fromNodeId===configId&&e.toNodeId===outputId),"Config must connect to output");
    const firstContent=output.metadata.content;
    const second:any=await call("run_nodes",{nodeIds:[outputId],requirements:"再生成图片，2K，9:16，质量最高"});
    check(second.value.ok,JSON.stringify(second));
    check(second.value.outcomes[0].sourceNodeId===configId,"Running an old image must reuse its config");
    check(second.value.outcomes[0].id!==outputId,"Repeat must produce a new output");
    check(current().nodes.filter(n=>n.type==="config").length===1,"Same config must be preserved");
    check(current().nodes.find(n=>n.id===outputId)?.metadata?.content===firstContent,"Previous image must stay unchanged");
    check(JSON.stringify(current().nodes.find(n=>n.id==="source-text")!.metadata)===original,"Source text stays unchanged");
    check(outgoing.length===2,"Exactly two requested calls, no corrective retry");
    // Lay out the three actual nodes for a readable evidence screenshot.
    useCanvasAssistantStore.getState().context!.applyOps([{type:"update_node",id:configId,patch:{position:{x:510,y:150}}},{type:"update_node",id:outputId,patch:{position:{x:1150,y:150}}},{type:"set_viewport",viewport:{x:0,y:0,k:0.7}}] as any);
    await frames();
    return {ok:true,configId,outputId,nodeCount:current().nodes.length,requests:outgoing.map(({size,quality,model,prompt})=>({size,quality,model,prompt})),chain:current().connections.filter(e=>e.fromNodeId==="source-text"||e.fromNodeId===configId)};
};
api.openPreview = async () => {
    const node=document.querySelector('[data-node-id="'+outputId+'"]'); check(node,"Result node rendered");
    const target=node!.querySelector("img")||node!;
    target.dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));
    await wait(()=>document.querySelector("[data-image-preview-thumbnails] button[aria-current=true]"));
    await frames();
    const strip=document.querySelector<HTMLElement>("[data-image-preview-thumbnails]")!;
    const media=document.querySelector<HTMLImageElement>("[data-image-preview-media]")!;
    await wait(()=>media.complete&&media.naturalWidth>0);
    const rect=strip.getBoundingClientRect();
    check(rect.bottom<=window.innerHeight&&rect.top>0&&rect.height>=56,"Thumbnails must fit visibly inside full window");
    check(strip.scrollWidth>strip.clientWidth,"52+ thumbnails must scroll horizontally");
    check(strip.querySelectorAll("button").length===54,"All canvas images included");
    return {count:54,viewport:{width:innerWidth,height:innerHeight},strip:{top:rect.top,bottom:rect.bottom,height:rect.height,width:rect.width,scrollWidth:strip.scrollWidth},decoded:{width:media.naturalWidth,height:media.naturalHeight}};
};
api.checkNavigation=async () => {
    const strip=document.querySelector<HTMLElement>("[data-image-preview-thumbnails]")!;
    const buttons=Array.from(strip.querySelectorAll<HTMLButtonElement>("button"));
    const before=JSON.stringify(current());
    buttons[0].click(); await frames(); check(buttons[0].getAttribute("aria-current")==="true","Click selects thumbnail");
    window.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true})); await frames();
    check(buttons.at(-1)!.getAttribute("aria-current")==="true","Left wraps to last canvas image");
    const selected=buttons.at(-1)!.getBoundingClientRect(), bounds=strip.getBoundingClientRect();
    check(selected.left>=bounds.left-1&&selected.right<=bounds.right+1,"Current thumbnail scrolls into view");
    window.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true})); await frames();
    check(buttons[0].getAttribute("aria-current")==="true","Right wraps to first canvas image");
    check(JSON.stringify(current())===before,"Viewer navigation must never mutate canvas");
    useThemeStore.setState({theme:"dark"}); await frames();
    return {ok:true,click:true,leftRightKeys:true,wrap:true,activeThumbnailVisible:true,canvasUnchanged:true};
};

api.runParallelCheck = async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
    const imageModel=useConfigStore.getState().config.imageModel, textModel=encodeChannelModel("offline-chat", "chat");
    const config=useConfigStore.getState().config;
    useConfigStore.setState({config:{...config,textModel,models:[...config.models,textModel],channels:[...(config.channels||[]),{id:"offline-chat",name:"offline chat",baseUrl:"https://offline-chat.test",apiKey:"fixture",apiFormat:"openai",models:[{name:"chat",capability:"text",script:relayChatScript}]}]}});
    let active=0, peak=0, requestCount=0;
    let releaseBatch:()=>void=()=>{}, batchReady=Promise.resolve();
    const holdBatch=()=>{batchReady=new Promise<void>(resolve=>{releaseBatch=resolve;});};
    const starts:string[]=[], failedImages:string[]=[];
    axios.defaults.adapter=async request=>{
        const body=JSON.parse(request.data); check(body.size==="1152x2048"&&body.quality==="max","Concurrent request parameters");
        requestCount++; active++; peak=Math.max(peak,active); const index=requestCount;
        starts.push(body.prompt);
        try {
            await batchReady;
            await new Promise(r=>setTimeout(r,120));
            if(body.prompt.includes("FAIL") || (body.prompt.includes("multi-image") && index===8)) {failedImages.push(body.prompt);throw new Error("fixture-provider-image-failed");}
            return {config:request,status:200,statusText:"OK",headers:{},data:{data:[{b64_json:paint(1152,2048,"PARALLEL "+index,"#24736b").split(",")[1]}]}};
        } finally {active--;}
    };
    const add=(owner:string,count=3,imageCount=1)=> {
        const ids=Array.from({length:count},(_,i)=>owner+"-"+i);
        useCanvasAssistantStore.getState().context!.applyOps(ids.map((id,index)=>({type:"add_node" as const,id,nodeType:"config",title:id,position:{x:100+index*700,y:1600},metadata:{prompt:owner+" "+(index===1?"FAIL":"OK")+" "+index,model:imageModel,imageAspectRatio:"9:16",imageResolution:"2k",size:"1152x2048",quality:"max",count:imageCount,status:"idle" as const}})));
        return ids;
    };
    const harnessIds=add("harness-parallel"); await frames();
    useCanvasAssistantStore.getState().context!.applyOps([{type:"set_viewport",viewport:{x:0,y:-300,k:0.25}}]);
    holdBatch();
    const harnessPending=call("run_nodes",{nodeIds:harnessIds});
    await wait(()=>active===3); await frames();
    check(harnessIds.every(id=>document.querySelector('[data-node-id="'+id+'"] button[aria-label="停止生成"]')),"All Harness configs must display running/stop controls: "+JSON.stringify({stops:document.querySelectorAll('button[aria-label="停止生成"]').length,nodes:harnessIds.map(id=>({id,html:document.querySelector('[data-node-id="'+id+'"]')?.outerHTML.slice(0,1200)}))}));
    releaseBatch();
    const harness:any=(await harnessPending).value;
    check(peak===3&&requestCount===3,"Harness must submit all three API calls before completion");
    check(harness.ok===false&&harness.outcomes.length===3,"Harness complete mixed receipt");
    check(harness.outcomes[0].ok&&!harness.outcomes[1].ok&&harness.outcomes[2].ok,"Harness keeps two successes and one failure");
    check(new Set(harness.outcomes.map((o:any)=>o.id)).size===3,"Independent output IDs");
    check(/成功 2，失败 1，未确认 0/.test(harness.summary),"Harness factual summary");
    check(harness.outcomes.every((o:any)=>current().nodes.some(n=>n.id===o.id&&current().connections.some(e=>e.fromNodeId===o.sourceNodeId&&e.toNodeId===o.id))),"Each output remains connected to its own config");
    const harnessPeak=peak; peak=0; const agentIds=add("agent-parallel"); await frames();
    const originalFetch=window.fetch; let modelCalls=0;
    window.fetch=(async (input,init)=>{if(!String(input instanceof Request?input.url:input).startsWith("https://offline-chat.test"))return originalFetch(input,init);const action=modelCalls++===0?{tool:"run_nodes",args:{nodeIds:agentIds}}:{tool:"final",args:{message:"全部生成成功（故意错误，用于核对不会采纳臆测）"}};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(action)}}]}),{headers:{"content-type":"application/json"}});}) as typeof fetch;
    try {
        const state=useCanvasAssistantStore.getState; state().setModel(textModel); state().setGenerationMode("auto"); state().setDraft("同时生成三张图片，2K，9:16，质量最高");
        holdBatch();
        const agentPending=state().send();
        await wait(()=>active===3); await frames();
        check(agentIds.every(id=>document.querySelector('[data-node-id="'+id+'"] button[aria-label="停止生成"]')),"All Agent configs must display running/stop controls");
        releaseBatch();
        await agentPending;
        check(peak===3&&requestCount===6,"Agent must submit all three API calls before completion");
        const session=state().sessions.find(s=>s.id===state().currentId)!;
        const summary=session.messages.findLast(m=>m.role==="assistant")!.text;
        check(/成功 2，失败 1，未确认 0/.test(summary)&&!summary.includes("全部生成成功"),"Agent must report actual results even when model final falsely claims success: "+summary+" / "+JSON.stringify(session.messages.filter(m=>m.role==="tool")));
        const agentReceipt=JSON.parse(session.messages.findLast(m=>m.role==="tool"&&m.text.startsWith("生成结果"))!.text.slice("生成结果：".length));
        check(agentReceipt.outcomes.length===3&&agentReceipt.outcomes.every((o:any)=>current().nodes.some(n=>n.id===o.id)),"Agent must retain all result nodes");
        peak=0; const multiIds=add("multi-image",1,3); await frames();
        const multi:any=(await call("run_nodes",{nodeIds:multiIds})).value;
        check(peak===3&&requestCount===9&&multi.outcomes[0].images.length===3,"A single config count=3 also sends simultaneous calls and returns each image");
        check(!multi.ok&&multi.outcomes[0].images.filter((i:any)=>i.ok).length===2&&multi.outcomes[0].images[1].status==="error"&&/成功 2，失败 1/.test(multi.summary),"Mixed multi-image output must report each actual success and failure");
        await frames();
        return {ok:true,harnessPeak,agentPeak:3,singleConfigPeak:peak,requests:requestCount,failedImages:failedImages.length,harnessSummary:harness.summary,agentSummary:summary,allOutputsRetained:true,noAutomaticRetry:true,paidApiRequests:0};
    } finally {window.fetch=originalFetch;useCanvasAssistantStore.getState().setGenerationMode("manual");}
};
