import assert from 'node:assert/strict';
import vm from 'node:vm';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import fs from 'node:fs';
import {createHarnessReferences} from '../../desktop/harness-references.cjs';
import {CanvasPromptChipInput} from '../src/components/canvas/canvas-prompt-chip-input';
import {addImagesToDeepSeekHarness, harnessSelectionState, resolveHarnessReference} from '../src/services/api/deepseek-harness';
import {registerBuiltinNodes} from '../src/components/canvas/nodes/builtin-nodes';
import {useCanvasAssistantStore} from '../src/stores/use-canvas-assistant-store';
import {useHarnessSidebarStore} from '../src/stores/use-harness-sidebar-store';
registerBuiltinNodes();
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const q=createHarnessReferences(),files=[{nodeId:'a',name:'image',dataUrl:pixel}],id=q.add('a',files);files[0].name='changed';assert.equal(q.get('a')[0].files[0].name,'image');assert.equal(q.get('b').length,0);q.ack('b',id);assert.equal(q.get('a').length,1);q.ack('a',id);assert.equal(q.get('a').length,0);assert.throws(()=>q.add('a',[]));assert.throws(()=>q.add('a',[{nodeId:'a',name:'x',dataUrl:'https://x'}]));
HTMLElement.prototype.scrollIntoView=function(){};
window.Range.prototype.getBoundingClientRect=()=>({left:0,top:0,bottom:20,right:0,width:0,height:20}) as DOMRect;
const nodes:any[]=[{id:'a',type:'image',title:'A',position:{x:0,y:0},width:640,height:640,metadata:{content:pixel,naturalWidth:1,naturalHeight:1}},{id:'b',type:'image',title:'B',position:{x:0,y:0},width:640,height:640,metadata:{content:pixel,naturalWidth:1,naturalHeight:1,groupId:'g'}},{id:'g',type:'group',title:'G',position:{x:0,y:0},width:640,height:640},{id:'empty',type:'image',position:{x:0,y:0},width:640,height:640,metadata:{}}];
let projectId='p',selectedNodeIds:string[]=['a'];const sent:any[]=[];useHarnessSidebarStore.subscribe((state,previous)=>{if(state.references!==previous.references)sent.push(...state.references.slice(previous.references.length))});useCanvasAssistantStore.setState({context:{getSnapshot:()=>({projectId,nodes,selectedNodeIds,connections:[]})} as any});(window as any).blinkflowHarness={publishModels:()=>{},open:async()=>({url:'http://localhost'}),addReferences:async(o:any)=>{sent.push(o);return 'batch'}};
async function main(){
assert.deepEqual(harnessSelectionState()?.nodes.map(n=>n.id),['a']);
assert.ok(!JSON.stringify(harnessSelectionState()).includes('base64'));
await assert.rejects(resolveHarnessReference({projectId:'p',args:{nodeId:'b'}} as any,new AbortController().signal),/先框选/);
const reference=await resolveHarnessReference({projectId:'p',args:{nodeId:'a'}} as any,new AbortController().signal);assert.equal((reference.value as any).hasImage,true);assert.ok(!JSON.stringify(reference).includes('base64'));
selectedNodeIds=[];await resolveHarnessReference({projectId:'p',args:{nodeId:'a'}} as any,new AbortController().signal);
await checkAgentCandidates();
await addImagesToDeepSeekHarness(['a']);assert.equal(sent[0].files[0].nodeId,'a');assert.equal(sent[0].files[0].dataUrl,pixel);await addImagesToDeepSeekHarness(['a','g','b']);assert.deepEqual(sent[1].files.map((f:any)=>f.nodeId),['a','b']);await assert.rejects(addImagesToDeepSeekHarness(['empty']),/请选择有内容/);(window as any).blinkflowHarness.open=async()=>{projectId='other';return {url:'http://localhost'}};await assert.rejects(addImagesToDeepSeekHarness(['a']),/画布已切换/);assert.equal(sent.length,2);assert.equal(nodes[0].metadata.content,pixel);const top=fs.readFileSync('src/components/canvas/canvas-top-bar.tsx','utf8'),dock=fs.readFileSync('src/components/agent/canvas-assistant-dock.tsx','utf8');assert.ok(top.indexOf('<Bot className="size-5"')<top.indexOf('aria-label="打开 DeepSeek Harness"'));assert.ok(top.includes('setOpen(!agentOpen || !wasAgent)'));assert.ok(dock.includes('<HarnessSidebarPane />'));assert.ok(dock.includes('role="tablist"'));assert.ok(!dock.includes('data-assistant-orb'));assert.ok(dock.includes('data-assistant-panel'));await checkHarnessClient();console.log('PASS Harness references: validation, project isolation, ack, single/multiple/group/empty image selection, project switch, original image preserved; fixed Agent entry.');}main().catch(e=>{console.error(e);process.exitCode=1});

async function checkHarnessClient(){
let plugin:any,changed:any,selectionChanged:any,source:any;
let selection:any={projectId:'p',nodes:[{id:'a',title:'A',type:'image'},{id:'t',title:'Text',type:'text'}]};
let triggerModule:any;const memoryStore=(initial:any)=>{let value=initial;const listeners=new Set<()=>void>();return {getSnapshot:()=>value,set:(next:any)=>{value=next;for(const fn of [...listeners])fn()},subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)}}};
const oldLoader=(window as any).__ModuleLoader__;
(window as any).__ModuleLoader__={load:(entry:any)=>{triggerModule=entry.factory((name:string)=>name==='@deepseek-ai/cordis'?{Service:class{}}:name==='@deepseek-ai/dsh-client-store'?{createSnapshotStore:memoryStore}:name==='@deepseek-ai/dsh-client-ui-primitives'?{}:require(name))}};
vm.runInThisContext(fs.readFileSync('../desktop/harness-runtime/runtime/node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8'));
(window as any).__ModuleLoader__=oldLoader;
const sources:any[]=[{trigger:'@',name:'reference',candidates:async()=>[{name:'unrelated-file'}]}];const inserts:any[]=[];
const controller=new triggerModule.InputTriggerController({sessionId:'session',actx:{bail:(_scope:any,event:any,data:any)=>{inserts.push({event,data});return true}},roster:{all:()=>sources,sources:(trigger:string)=>sources.filter(s=>s.trigger===trigger)}});
const registrations:any[]=[];let batches:any[]=[{id:'batch-1',projectId:'p',files:[{nodeId:'a',name:'A [a]',dataUrl:pixel}]}];const attachments:any[]=[];const received:any[]=[];const released:any[]=[];let locked=false;let draft='Keep my current instructions';let focused=0;
const input={addAttachments:(ids:string[])=>{if(locked)return false;attachments.push(...ids);return true},focus:()=>focused++};const binding={ctx:{}};
const ctx:any={effect:(f:any)=>f(),inputTriggers:{registerSource:(s:any)=>{source=s;sources.unshift(s);return()=>{}},sessionOf:()=>controller},slots:{inject:(_:string,f:()=>void)=>f(),register:(spec:any,component:any)=>registrations.push({spec,component})},sessions:{binding:()=>binding},conversation:{input:{for:(scope:any)=>{assert.equal(scope,binding.ctx);return input}},createDrafts:(_:string,files:File[])=>{received.push(...files);return files.map((file,i)=>({id:'draft-'+received.length+'-'+i,file}))},releaseDraftAttachments:(files:any[])=>released.push(...files)}};
(window as any).blinkflowHarnessReferences={selection:async()=>selection,onSelection:(fn:any)=>{selectionChanged=fn;return()=>selectionChanged=undefined},resolve:async(id:string,project:string)=>{if(project!=='p')return {error:'画布已切换'};return {value:{id,hasImage:true}}},get:async()=>batches,ack:async(id:string)=>{batches=batches.filter(b=>b.id!==id)},onChange:(f:any)=>{changed=f;return()=>{changed=undefined}}};
(window as any).__ModuleLoader__={load:(entry:any)=>{plugin=entry.factory((name:string)=>name==='react'?React:require(name))}};
vm.runInThisContext(fs.readFileSync('../desktop/harness-runtime/runtime/canvas-ui/client.js','utf8'));plugin.apply(ctx);const reg=registrations.find(r=>r.spec.name==='conversation.input.dock');assert.ok(reg);const props=reg.spec.inject('session');const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);const wait=()=>new Promise(r=>setTimeout(r,70));await act(async()=>{root.render(React.createElement(reg.component,props));await wait();});await act(wait);assert.equal(attachments.length,1);assert.equal(received[0].name,'A [a]');assert.equal(received[0].type,'image/png');assert.equal(batches.length,0);assert.equal(focused,1);
const signal=new AbortController().signal;
assert.deepEqual((await source.candidates({sessionId:'session'},{query:'',signal})).map((c:any)=>c.name),['a','t']);
assert.deepEqual((await source.candidates({sessionId:'session'},{query:'text',signal})).map((c:any)=>c.name),['t']);
controller.track('@',1,{tier:'plain'},1);await act(wait);
assert.deepEqual(controller.menu.getSnapshot().groups.map((g:any)=>g.source),['blinkflow-canvas-nodes']);
assert.equal(controller.menu.getSnapshot().groups[0].items.length,2);assert.ok(controller.menu.getSnapshot().highlight,'keyboard highlight exists');
controller.arbitrate('enter',false);await act(wait);assert.equal(inserts.at(-1).data.reference.label,'A');
const ref=inserts.at(-1).data.reference.ref;assert.equal(source.codec.clipboardText(ref),'@A');assert.equal(JSON.parse(await source.codec.serialize(ref,signal)).canvasReference.id,'a');
const oldRef=JSON.stringify({projectId:'other',id:'a',title:'old'});await assert.rejects(source.codec.serialize(oldRef,signal),/画布已切换/);
controller.track('@T',2,{tier:'plain'},2);await act(wait);assert.equal(controller.menu.getSnapshot().groups[0].items[0].name,'t');
selection={projectId:'p',nodes:[]};await act(async()=>{await selectionChanged();await wait()});
assert.ok(controller.menu.getSnapshot().groups.some((g:any)=>g.source==='reference'),'original Harness sources restored after deselect');
selection={projectId:'p',nodes:[{id:'a',title:'A',type:'image'}]};await act(async()=>{await selectionChanged();await wait()});controller.track('@',1,{tier:'plain'},3);await act(wait);assert.deepEqual(controller.menu.getSnapshot().groups.map((g:any)=>g.source),['blinkflow-canvas-nodes']);
await act(async()=>{await changed();await wait();});assert.equal(attachments.length,1);
locked=true;batches=[{id:'batch-2',projectId:'p',files:[{nodeId:'a',name:'B [a]',dataUrl:pixel}]}];await act(async()=>{await changed();await wait();});assert.equal(attachments.length,1);assert.equal(batches.length,1);assert.equal(released.length,1);assert.ok(container.textContent?.includes('重试添加'));locked=false;await act(async()=>{container.querySelector('button')!.click();await wait();});assert.equal(attachments.length,2);assert.equal(batches.length,0);assert.equal(draft,'Keep my current instructions');await act(async()=>root.unmount());container.remove();assert.equal(changed,undefined);assert.equal(selectionChanged,undefined);controller.dispose();console.log('PASS Harness official slot: actual File attachment, no auto-send, ack/dedup, locked retry, draft preserved, listener cleanup.');
}

async function checkAgentCandidates(){
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const references=['a','b'].map(id=>({id,nodeId:id,kind:'text' as const,title:id==='a'?'First':'Second',label:'@['+id+']',active:true}));
 const render=(ids:string[])=>root.render(<CanvasPromptChipInput ariaLabel="Test selected mentions" value="@[a] @" references={references} mentionNodeIds={ids} onChange={()=>{}} />);
 const wait=()=>new Promise(r=>setTimeout(r,40));
 await act(async()=>{render(['b']);await wait()});
 const editor=host.querySelector<HTMLElement>('[contenteditable]')!;
 assert.equal(editor.querySelector('[data-ref-label]')?.textContent,'First','existing unselected inline reference preserved');
 editor.focus();const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
 await act(async()=>{editor.dispatchEvent(new Event('input',{bubbles:true}));await wait()});
 const menu=()=>document.querySelector('[data-canvas-resource-mention-menu]');
 assert.ok(menu());assert.ok(menu()!.textContent?.includes('Second'));assert.ok(!menu()!.textContent?.includes('First'));
 await act(async()=>{render(['a','b']);await wait()});assert.ok(menu()!.textContent?.includes('First')&&menu()!.textContent?.includes('Second'));
 await act(async()=>{render([]);await wait()});assert.ok(menu()!.textContent?.includes('First'));
 await act(async()=>root.unmount());host.remove();console.log('PASS Agent selected-only @ candidates, multiple selection, deselection and existing draft reference rendering.');
}
