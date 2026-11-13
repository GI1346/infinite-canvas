import assert from "node:assert/strict";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { fetchChannelModelDetails, requestGeneration, requestEdit, requestImageQuestion } from "../src/services/api/image";
import { defaultConfig, createModelChannel, useConfigStore } from "../src/stores/use-config-store";

// Offline contract checks with synthetic credentials; all unexpected network calls fail.
const original = { adapter: axios.defaults.adapter, fetch: globalThis.fetch };
const image = createModelChannel({ id:"image",name:"user-image",baseUrl:"https://image.invalid/v1/",apiKey:"image-test-key",models:[{ name:"gpt-image-2.5-sunburst",capability:"image" }] });
const text = createModelChannel({ id:"text",name:"user-text",baseUrl:"https://text.invalid",apiKey:"text-test-key",models:[{ name:"chat-test",capability:"text" }] });
const config = { ...defaultConfig,channels:[image,text],model:"image::gpt-image-2.5-sunburst",imageModel:"image::gpt-image-2.5-sunburst",textModel:"text::chat-test",size:"1024x1024",quality:"max" };
const response = (req: InternalAxiosRequestConfig,data:unknown,status=200) => ({ data,status,statusText:"fixture",headers:{},config:req });
let passed=0;
async function check(name:string,run:()=>void|Promise<void>) {
 axios.defaults.adapter=async req=>{throw Error("Unexpected request "+req.url);};globalThis.fetch=async()=>{throw Error("Unexpected fetch");};
 await run();passed++;console.log("PASS "+name);
}
async function main() {
 useConfigStore.setState({config:{...defaultConfig,proxyEnabled:false}});
 await check("fresh defaults contain no provider-specific channel or task URL",()=>{assert.equal(defaultConfig.channels.length,1);assert.equal(defaultConfig.channels[0].apiKey,"");assert(!/65535|imageTaskBaseUrl/.test(JSON.stringify(defaultConfig)));});
 await check("saved channels preserve independent credentials and bindings without re-adding presets",()=>{
  const merge=useConfigStore.persist.getOptions().merge!;
  const saved={...image,baseUrl:"https://sub-proxy-us.65535.space",imageTaskBaseUrl:"https://task-api-1-cn.65535.space",models:[{name:"custom-painter",capability:"image",script:"return [];",protocolId:"custom"}]};
  const next=merge({config:{...config,imageModel:"image::custom-painter",model:"image::custom-painter",channels:[saved,text]}},useConfigStore.getState()).config;
  // 退场的脚本与自定义协议字段在归一化时被丢弃，只保留名称与能力。
  const expected={...saved,models:[{name:"custom-painter",capability:"image"}],baseUrl:saved.baseUrl,apiKey:saved.apiKey};
  delete (expected as Record<string, unknown>).imageTaskBaseUrl;
  assert.deepEqual(next.channels,[expected,text]);assert.equal(next.imageModel,"image::custom-painter");assert.equal(next.textModel,config.textModel);
 });
 await check("legacy task field is discarded by channel normalization, not a routing input",()=>{const channel=createModelChannel({...image,imageTaskBaseUrl:"https://never.invalid"} as typeof image);assert(!("imageTaskBaseUrl" in channel));assert.equal(channel.baseUrl,image.baseUrl);assert.equal(channel.apiKey,image.apiKey);});
 await check("models use only their channel address/key; no pricing/tasks requests",async()=>{
  const urls:string[]=[];axios.defaults.adapter=async req=>{urls.push(req.url!);assert.equal(req.headers.Authorization,"Bearer image-test-key");return response(req,{data:[{id:"gpt-image-2.5-sunburst"},{id:"custom-painter",capabilities:["image"]},{id:""}]});};
  assert.deepEqual(await fetchChannelModelDetails(image),[{name:"custom-painter",capability:"image"},{name:"gpt-image-2.5-sunburst",capability:"image"}]);assert.deepEqual(urls,["https://image.invalid/v1/models"]);
 });
 await check("saved capability is retained and legacy script fields are dropped",async()=>{const channel={...image,models:[{name:"custom-painter",capability:"image" as const,script:"return [];",protocolId:"custom"}]};axios.defaults.adapter=async req=>response(req,{data:[{id:"custom-painter"}]});assert.deepEqual(await fetchChannelModelDetails(channel),[{name:"custom-painter",capability:"image"}]);});
 await check("same provider address has no special model-list routing",async()=>{
  const channel={...image,baseUrl:"https://sub-proxy-us.65535.space",imageTaskBaseUrl:"https://unreachable.invalid"};let calls=0;
  axios.defaults.adapter=async req=>{calls++;assert.equal(req.url,channel.baseUrl+"/v1/models");return response(req,{data:[]});};assert.deepEqual(await fetchChannelModelDetails(channel),[]);assert.equal(calls,1);
 });
 await check("native 502 details and upstream authentication errors are surfaced with no fallback",async()=>{
  for(const [status,message]of [[502,"桌面网络转发：连接失败（ERR_CONNECTION_CLOSED）"],[401,"synthetic invalid key"]]as const){let calls=0;axios.defaults.adapter=async req=>{calls++;throw new AxiosError("Request failed with status code "+status,"ERR_BAD_RESPONSE",req,undefined,response(req,{error:{message}},status));};await assert.rejects(fetchChannelModelDetails(image),(e:Error)=>e.message===message);assert.equal(calls,1);}
 });
 await check("malformed model list fails explicitly",async()=>{axios.defaults.adapter=async req=>response(req,{models:[]});await assert.rejects(fetchChannelModelDetails(image),/data 数组/);});
 await check("generation uses standard endpoint and explicit maximum quality",async()=>{
  let calls=0;axios.defaults.adapter=async req=>{calls++;assert.equal(req.url,"https://image.invalid/v1/images/generations");assert.equal(req.headers.Authorization,"Bearer image-test-key");const body=JSON.parse(req.data);assert.equal(body.quality,"max");assert.equal(body.size,"1024x1024");assert.equal(body.model,"gpt-image-2.5-sunburst");assert(!body.kind&&!body.input);return response(req,{data:[{url:"https://generated.invalid/image.png"}]});};
  assert.equal((await requestGeneration(config,"test"))[0].dataUrl,"https://generated.invalid/image.png");assert.equal(calls,1);
 });
 await check("legacy task metadata cannot hijack generation after removal",async()=>{
  const legacy={...image,baseUrl:"https://sub-proxy-us.65535.space",imageTaskBaseUrl:"https://never.invalid"};axios.defaults.adapter=async req=>{assert.equal(req.url,legacy.baseUrl+"/v1/images/generations");return response(req,{data:[{url:"https://generated.invalid/image.png"}]});};await requestGeneration({...config,channels:[legacy,text]},"test");
 });
 await check("reference editing uses the same address and ordered multipart files",async()=>{
  let calls=0;axios.defaults.adapter=async req=>{calls++;assert.equal(req.url,"https://image.invalid/v1/images/edits");assert.equal(req.headers.Authorization,"Bearer image-test-key");const form=req.data as FormData;assert.equal(form.get("quality"),"max");assert.equal(form.getAll("image[]").length,2);assert.equal(form.get("model"),"gpt-image-2.5-sunburst");return response(req,{data:[{url:"https://generated.invalid/edit.png"}]});};
  const refs=[{id:"1",name:"first",type:"image/png",dataUrl:"data:image/png;base64,AQ=="},{id:"2",name:"second",type:"image/png",dataUrl:"data:image/png;base64,Ag=="}];assert.equal((await requestEdit(config,"edit",refs))[0].dataUrl,"https://generated.invalid/edit.png");assert.equal(calls,1);
 });
 await check("standard text requests keep their own address/key",async()=>{
  globalThis.fetch=async(url,options)=>{assert.equal(url,"https://text.invalid/v1/responses");assert.equal((options?.headers as Record<string,string>).Authorization,"Bearer text-test-key");return new Response("data: "+JSON.stringify({type:"response.output_text.delta",delta:"text result"})+"\n\n",{headers:{"content-type":"text/event-stream"}});};
  assert.equal(await requestImageQuestion({...config,model:config.textModel},[{role:"user",content:"hello"}],()=>{}),"text result");
 });
 await check("agent decisions use chat completions, not the removed script runtime",async()=>{
  let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,"https://text.invalid/v1/chat/completions");const body=JSON.parse(String(options?.body));assert.equal(body.model,"chat-test");assert(!("thinking" in body));return new Response(JSON.stringify({choices:[{message:{content:"{\"tool\":\"none\"}"}}]}),{headers:{"content-type":"application/json"}});};
  assert.equal(await requestImageQuestion({...config,model:config.textModel},[{role:"user",content:"hello"}],()=>{}, {agent:true}),"{\"tool\":\"none\"}");assert.equal(calls,1);
 });
 await check("Gemini agent decisions constrain JSON like the OpenAI path",async()=>{
  const gemini=createModelChannel({id:"gem",name:"g",baseUrl:"https://gemini.invalid",apiKey:"gem-key",apiFormat:"gemini",models:[{name:"gemini-test",capability:"text"}]});
  let captured:any;
  globalThis.fetch=async(url,options)=>{assert.equal(url,"https://gemini.invalid/v1beta/models/gemini-test:streamGenerateContent?alt=sse");assert.equal((options?.headers as Record<string,string>)["x-goog-api-key"],"gem-key");captured=JSON.parse(String(options?.body));return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'{"tool":"none"}'}]}}]})+'\n\n',{headers:{"content-type":"text/event-stream"}});};
  assert.equal(await requestImageQuestion({...config,channels:[gemini],model:"gem::gemini-test",textModel:"gem::gemini-test"},[{role:"user",content:"hi"}],()=>{},{agent:true}),"{\"tool\":\"none\"}");
  assert.equal(captured.generationConfig.responseMimeType,"application/json");
 });
 await check("Gemini remains available as a first-class protocol",async()=>{axios.defaults.adapter=async req=>{assert.equal(req.url,"https://gemini.invalid/v1beta/models");return response(req,{models:[{name:"models/gemini-test"}]});};assert.deepEqual(await fetchChannelModelDetails({...text,baseUrl:"https://gemini.invalid",apiFormat:"gemini"}),[{name:"gemini-test",capability:"text"}]);});
 await check("missing channel or empty key never borrows another channel credential",async()=>{await assert.rejects(requestGeneration({...config,channels:[{...image,apiKey:""},text]},"test"),/独立 API Key/);await assert.rejects(requestGeneration({...config,model:"missing::gpt-image-2.5-sunburst"},"test"),/不存在/);});
 console.log("Single-address checks: "+passed+" passed; offline, no paid requests.");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{axios.defaults.adapter=original.adapter;globalThis.fetch=original.fetch;});
