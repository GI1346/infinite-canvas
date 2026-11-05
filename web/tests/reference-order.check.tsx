import assert from "node:assert/strict";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { CanvasNodeReferenceBar } from "../src/components/canvas/canvas-node-reference-bar";
import { buildNodeGenerationContext } from "../src/components/canvas/canvas-node-generation";
import { orderReferenceNodes, buildNodeMentionReferences } from "../src/lib/canvas/canvas-resource-references";
import { createCanvasNode, applyNodeConfigPatch } from "../src/lib/canvas/canvas-node-factory";
import { fitNodeSize, generatedImageNodeSize } from "../src/lib/canvas/canvas-node-size";
import { createGenerationBranch } from "../src/lib/canvas/canvas-generation-branch";
import { useCanvasImageSettingsStore } from "../src/stores/canvas/use-canvas-image-settings-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from "../src/types/canvas";
import type { AiConfig } from "../src/stores/use-config-store";

const node=(id:string,type=CanvasNodeType.Image):CanvasNodeData=>({id,type,title:id,position:{x:120,y:300},width:640,height:640,metadata:{content:type===CanvasNodeType.Image?`data:image/png;base64,${id}`:id}});
let target={...node("target"),metadata:{prompt:"@[node:c]",quality:"max",size:"2048x2048"}} as CanvasNodeData;
const refs=[node("a"),node("b"),node("c")];let nodes=[...refs,target];
const connections:CanvasConnection[]=refs.map(n=>({id:n.id,fromNodeId:n.id,toNodeId:target.id}));
const geometry=JSON.stringify(nodes.map(({position,width,height})=>({position,width,height}))),edges=JSON.stringify(connections);
const host=document.createElement("div");document.body.append(host);let root=createRoot(host),changes=0,removed:string[][]=[],selected="";
function render(enabled=true){root.render(<CanvasNodeReferenceBar nodeId={target.id} nodes={nodes} connectedNodes={refs} onReorder={enabled?(ids)=>{changes++;target=applyNodeConfigPatch(target,{referenceNodeOrder:ids});nodes=[...refs,target];render();}:undefined} onDisconnect={(a,b)=>removed.push([a,b])} onStartSelection={id=>selected=id}/>);}
const ids=()=>Array.from(host.querySelectorAll<HTMLElement>("[data-reference-node-id]")).map(e=>e.dataset.referenceNodeId);
const element=(id:string)=>host.querySelector<HTMLElement>(`[data-reference-node-id="${id}"]`)!;
function dragEvent(id:string,type:string){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,"dataTransfer",{value:{effectAllowed:"",dropEffect:"",setData(){}}});element(id).dispatchEvent(e);return e;}
async function drag(from:string,to:string){await act(async()=>{dragEvent(from,"dragstart");});await act(async()=>{assert(dragEvent(to,"dragover").defaultPrevented);dragEvent(to,"drop");});await act(async()=>{dragEvent(from,"dragend");});}
async function main(){
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error("Network forbidden");};
 try{
  await act(async()=>render());assert.deepEqual(ids(),["a","b","c"]);
  await drag("c","a");assert.deepEqual(ids(),["c","a","b"]);assert.deepEqual(target.metadata?.referenceNodeOrder,ids());
  assert.deepEqual(buildNodeGenerationContext("target",nodes,connections,"draw").referenceImages.map(i=>i.id),ids());
  assert.deepEqual(buildNodeMentionReferences(target,nodes,connections).map(i=>i.nodeId),ids());
  assert.equal(host.querySelector("img")?.draggable,false);
  await drag("c","b");assert.deepEqual(ids(),["a","b","c"]);assert.equal(changes,2);
  await act(async()=>{dragEvent("a","dragstart");});await act(async()=>{dragEvent("a","dragend");});assert.equal(changes,2);
  await drag("a","a");assert.equal(changes,2);
  await drag("c","a");target=JSON.parse(JSON.stringify(target));nodes=[...refs,target];
  await act(async()=>root.unmount());root=createRoot(host);await act(async()=>render());assert.deepEqual(ids(),["c","a","b"]);
  await act(async()=>{element("a").querySelector("button")!.click();});assert.deepEqual(removed,[["a","target"]]);
  await act(async()=>{Array.from(host.querySelectorAll<HTMLButtonElement>("button")).at(-1)!.click();});assert.equal(selected,"target");
  await act(async()=>render(false));assert(Array.from(host.querySelectorAll<HTMLElement>("[data-reference-node-id]")).every(e=>!e.draggable));
  assert.equal(dragEvent("a","dragstart").defaultPrevented,true);assert.equal(changes,3);
  assert.equal(JSON.stringify(nodes.map(({position,width,height})=>({position,width,height}))),geometry);assert.equal(JSON.stringify(connections),edges);
  assert.equal(target.metadata?.quality,"max");assert.equal(target.metadata?.prompt,"@[node:c]");
  assert.deepEqual(orderReferenceNodes(refs,["missing","c","b"]).map(n=>n.id),["c","b","a"]);
  assert.deepEqual(orderReferenceNodes(refs).map(n=>n.id),["a","b","c"]);
  assert.deepEqual(orderReferenceNodes([...refs,node("d")],["c","a","b"]).map(n=>n.id),["c","a","b","d"]);
  const group=node("group",CanvasNodeType.Group),a={...refs[0],metadata:{...refs[0].metadata,groupId:"group"}},b={...refs[1],metadata:{...refs[1].metadata,groupId:"group"}};
  const grouped=[group,a,b,refs[2],target],groupEdges=[{id:"g",fromNodeId:"group",toNodeId:"target"},connections[2]];
  assert.deepEqual(buildNodeGenerationContext("target",grouped,groupEdges,"draw").referenceImages.map(i=>i.id),["c","a","b"]);
  const config={...node("config",CanvasNodeType.Config),metadata:{composerContent:"@[node:b] @[node:a]",referenceNodeOrder:["a","b"]}};
  assert.deepEqual(buildNodeGenerationContext("config",[...refs,config],refs.map(n=>({id:n.id,fromNodeId:n.id,toNodeId:"config"})),config.metadata.composerContent).referenceImages.map(i=>i.id),["a","b","c"]);
  const branch=createGenerationBranch({...target,metadata:{...target.metadata,content:"data:image/png;base64,AA",generationType:"edit"}},nodes,connections,{} as AiConfig,"image","draw")!;
  assert.deepEqual(branch.node.metadata?.referenceNodeOrder,["c","a","b"]);assert.notEqual(branch.node.metadata?.referenceNodeOrder,target.metadata?.referenceNodeOrder);
  const panel=readFileSync("src/components/canvas/canvas-node-prompt-panel.tsx","utf8");assert.equal((panel.match(/onReorder=\{isRunning \? undefined/g)||[]).length,2);
  useCanvasImageSettingsStore.setState({settings:null});
  let fresh=createCanvasNode(CanvasNodeType.Image,{x:1000,y:1000});assert.equal(fresh.width,640);assert.equal(fresh.height,640);assert.deepEqual(fresh.position,{x:680,y:680});
  for(const [w,h] of [[2048,2048],[1360,2048],[2048,1152]]){
   useCanvasImageSettingsStore.getState().remember({size:`${w}x${h}`,quality:"max"});fresh=createCanvasNode(CanvasNodeType.Image,{x:1000,y:1000});
   assert.deepEqual({width:fresh.width,height:fresh.height},fitNodeSize(w,h));assert.deepEqual(generatedImageNodeSize(w,h,fresh),fitNodeSize(w,h));
   const patched=applyNodeConfigPatch(fresh,{size:`${h}x${w}`});assert.deepEqual({width:patched.width,height:patched.height},fitNodeSize(h,w));assert.equal(patched.position.x+patched.width/2,1000);
  }
  const existing=node("existing");existing.width=200;existing.height=300;assert.deepEqual({width:applyNodeConfigPatch(existing,{quality:"max"}).width,height:applyNodeConfigPatch(existing,{size:"2048x1152"}).height},{width:200,height:300});
  fresh.metadata={imageSizeManual:true};assert.deepEqual(generatedImageNodeSize(2048,2048,fresh),{width:fresh.width,height:fresh.height});
  const text=createCanvasNode(CanvasNodeType.Text,{x:0,y:0});assert.equal(text.width,340);assert.equal(text.height,240);
  console.log("PASS reference drag/drop, persistence, outgoing order, mention numbering, groups, cancel/disabled, branch inheritance, normal/expanded wiring; new-node import scale, ratio, manual size and text unchanged (offline)");
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=oldFetch;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
