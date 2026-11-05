import React from "react";
import { createRoot } from "react-dom/client";
import { AssistantImageCompression } from "../src/components/agent/assistant-image-compression";
import { useAssistantCompressionStore } from "../src/stores/use-assistant-compression-store";
import { useCanvasAssistantStore, type CanvasAssistantContext } from "../src/stores/use-canvas-assistant-store";
import { defaultConfig, encodeChannelModel, useConfigStore } from "../src/stores/use-config-store";
import { executeHarnessCanvasTool, addImagesToDeepSeekHarness } from "../src/services/api/deepseek-harness";
import { useHarnessSidebarStore } from "../src/stores/use-harness-sidebar-store";
import { registerBuiltinNodes } from "../src/components/canvas/nodes/builtin-nodes";
import { applyCanvasAgentOps, type CanvasAgentSnapshot } from "../src/lib/canvas/canvas-agent-ops";
import { relayChatScript } from "../src/services/api/relay-chat";
import { dataUrlToFile } from "../src/lib/image-utils";
import "../src/styles/globals.css";
const results: unknown[] = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 60));
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
async function size(url: string) { const f = dataUrlToFile({ id: "x", name: "x.jpg", type: "image/jpeg", dataUrl: url }); const b = await createImageBitmap(f); const result = { width: b.width, height: b.height, bytes: f.size }; b.close(); return result; }
async function main() {
 registerBuiltinNodes();
 const imageModel=encodeChannelModel("offline", "gpt-image-1"), textModel=encodeChannelModel("chat", "fixture-chat");
 const config={...defaultConfig,proxyEnabled:false,imageModel,textModel,models:[imageModel,textModel],channels:[{id:"offline",name:"offline",baseUrl:"https://never-image.test",apiKey:"fixture",apiFormat:"openai" as const,models:[{name:"gpt-image-1",capability:"image" as const}]},{id:"chat",name:"chat",baseUrl:"https://never-chat.test",apiKey:"fixture",apiFormat:"openai" as const,models:[{name:"fixture-chat",capability:"text" as const,script:relayChatScript}]}]};
 useConfigStore.setState({config});
 const prefs=()=>useAssistantCompressionStore.getState();
 prefs().update("agent",{imageCompressionEnabled:false,imageCompressionResolution:"2k",imageCompressionMaxMb:1});prefs().update("harness",{imageCompressionEnabled:false,imageCompressionResolution:"2k",imageCompressionMaxMb:1});
 createRoot(document.getElementById("root")!).render(<div style={{width:360,padding:12,display:"grid",gap:12}}><AssistantImageCompression owner="agent"/><AssistantImageCompression owner="harness"/></div>);await tick();
 const switches=[...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')];assert(switches.length===2&&switches.every(b=>b.getAttribute("aria-checked")==="false"),"Both controls default OFF");switches[0].click();await tick();assert(prefs().agent.imageCompressionEnabled&&!prefs().harness.imageCompressionEnabled,"Independent slider settings");
 const canvas=document.createElement("canvas");canvas.width=2500;canvas.height=1250;const ctx=canvas.getContext("2d")!,pixels=ctx.createImageData(2500,1250);let seed=92;for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);const original=canvas.toDataURL("image/jpeg",0.98);
 let snapshot:CanvasAgentSnapshot={projectId:"compression-offline",title:"test",viewport:{x:0,y:0,k:1},selectedNodeIds:["input"],connections:[],nodes:[{id:"input",title:"original",type:"image",width:100,height:100,position:{x:0,y:0},metadata:{content:original,status:"success"}},{id:"config",title:"config",type:"config",width:100,height:100,position:{x:120,y:0},metadata:{model:imageModel,prompt:"test",imageCompressionEnabled:true}}]};
 let runs=0;const expected: Array<{imageCompressionEnabled:boolean;imageCompressionResolution:string;imageCompressionMaxMb:number}>=[];
 const context:CanvasAssistantContext={snapshot,getSnapshot:()=>snapshot,applyOps:ops=>snapshot=applyCanvasAgentOps(snapshot,ops),runNode:async(id)=>{const node=snapshot.nodes.find(n=>n.id===id)!;const wanted=expected.shift()!;assert(wanted&&Object.entries(wanted).every(([k,v])=>(node.metadata as any)[k]===v),"Assistant settings applied before runner, OFF overrides stale ON");runs++;const output={...node,id:"output-"+runs,metadata:{...node.metadata,status:"success" as const,content:original,naturalWidth:2500,naturalHeight:1250}};snapshot={...snapshot,nodes:[...snapshot.nodes,output]};return output;}};
 const agent=()=>useCanvasAssistantStore.getState();agent().setContext(context);await tick();agent().setGenerationMode("auto");prefs().update("agent",{imageCompressionEnabled:true,imageCompressionResolution:"1k",imageCompressionMaxMb:0.2});
 const realFetch=window.fetch;let calls=0;window.fetch=(async(_url,init)=>{const body=JSON.parse(String(init?.body));const image=body.messages.flatMap((m:any)=>Array.isArray(m.content)?m.content:[]).find((p:any)=>p.type==="image_url")?.image_url.url;assert(image,"Agent actual dialogue request contains image");const actual=await size(image);assert(actual.width<=1024&&actual.bytes<=0.2*1048576,"Agent request carries compressed bytes");results.push({check:"Agent actual chat request ON",...actual});const content=++calls===1?JSON.stringify({tool:"run_nodes",args:{nodeIds:["config"]}}):JSON.stringify({tool:"final",args:{message:"done"}});return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{"content-type":"application/json"}});}) as typeof fetch;
 expected.push({...prefs().agent});agent().setDraft("生成图片");agent().addReferences(["input"]);await agent().send();window.fetch=realFetch;assert(calls===2&&runs===1,"Agent actual send and run lifecycle: "+JSON.stringify({calls,runs,messages:agent().sessions[0]?.messages.map(m=>({role:m.role,text:m.role==="user"?"omitted":m.text}))}));
 const signal=new AbortController().signal;const request={id:"fixture",projectId:snapshot.projectId,tool:"read_assets",args:{nodeIds:["input"]}};
 let read=await executeHarnessCanvasTool(request,signal);assert(read.images?.[0].url===original,"Harness OFF exact original and independent of Agent ON");results.push({check:"Harness OFF preserves exact original",...(await size(read.images![0].url))});
 prefs().update("harness",{imageCompressionEnabled:true,imageCompressionResolution:"2k",imageCompressionMaxMb:0.15});read=await executeHarnessCanvasTool(request,signal);let actual=await size(read.images![0].url);assert(actual.width<=2048&&actual.bytes<=0.15*1048576,"Harness tool actual compressed bytes");results.push({check:"Harness read_assets ON",...actual});
 window.blinkflowHarness={open:async()=>({url:"http://127.0.0.1:1"}),publishModels:()=>{},publishSelection:()=>{},addReferences:async()=>"unused",onImageModel:()=>()=>{},onTool:()=>()=>{},respond:()=>{}};
 await addImagesToDeepSeekHarness(["input"]);actual=await size(useHarnessSidebarStore.getState().references.at(-1)!.files[0].dataUrl);assert(actual.width<=2048&&actual.bytes<=0.15*1048576,"Harness attachment queue contains compressed bytes");results.push({check:"Harness actual attachment ON",...actual});
 expected.push({...prefs().harness});await executeHarnessCanvasTool({id:"run-on",projectId:snapshot.projectId,tool:"run_nodes",args:{nodeIds:["config"]}},signal);
 prefs().update("harness",{imageCompressionEnabled:false});expected.push({...prefs().harness});await executeHarnessCanvasTool({id:"run-off",projectId:snapshot.projectId,tool:"run_nodes",args:{nodeIds:["config"]}},signal);
 prefs().update("agent",{imageCompressionEnabled:false});let offCalls=0;window.fetch=(async(_url,init)=>{const body=JSON.parse(String(init?.body));const images=body.messages.flatMap((m:any)=>Array.isArray(m.content)?m.content:[]).filter((p:any)=>p.type==="image_url");assert(images.at(-1)?.image_url.url===original,"Agent OFF sends exact original");const content=++offCalls===1?JSON.stringify({tool:"run_nodes",args:{nodeIds:["config"]}}):JSON.stringify({tool:"final",args:{message:"done"}});return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{"content-type":"application/json"}});}) as typeof fetch;
 expected.push({...prefs().agent});agent().setDraft("再生成");agent().addReferences(["input"]);await agent().send();window.fetch=realFetch;assert(offCalls===2&&runs===4,"Both assistants execute OFF override through real lifecycles");assert(snapshot.nodes.find(n=>n.id==="input")!.metadata!.content===original,"Original image unchanged");
 const saved=JSON.parse(localStorage.getItem("blinkflow_assistant_image_compression")!).state;assert(saved.agent.imageCompressionMaxMb===0.2&&saved.harness.imageCompressionMaxMb===0.15,"Independent preferences persist");
 results.push({check:"Two sliders, independent persistence, both real runners ON/OFF, original protection",runs,paidCalls:0});await agent().clearHistory();return results;
}
(window as any).__compressionCheck=main().then(results=>({ok:true,results})).catch(error=>({ok:false,results,error:String(error.stack||error)}));
