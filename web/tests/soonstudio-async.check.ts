import assert from "node:assert/strict";
import axios from "axios";
import { requestGeneration } from "../src/services/api/image";
import { defaultConfig, createModelChannel, useConfigStore } from "../src/stores/use-config-store";
const channel = createModelChannel({ id:"soon", name:"soon", baseUrl:"https://api.soonstudio.ai/v1", apiKey:"test-key", models:[{name:"gpt-image-2.6-sunburst",capability:"image"}] });
const config = {...defaultConfig, channels:[channel], model:"soon::gpt-image-2.6-sunburst", imageModel:"soon::gpt-image-2.6-sunburst", size:"1024x1024"};
const old = axios.defaults.adapter;
async function main() {
 useConfigStore.setState({config:{...defaultConfig,proxyEnabled:false}});
 let calls=0;
 axios.defaults.adapter=async req=>{ calls++; assert.equal(req.headers.Authorization,"Bearer test-key"); const data=calls===1?{task_id:"task/123"}:calls===2?{status:"IN_PROGRESS"}:{status:"SUCCESS",data:[{url:"https://generated.invalid/result.png"}]}; assert.equal(req.url,calls===1?"https://api.soonstudio.ai/v1/images/generations":"https://api.soonstudio.ai/v1/images/tasks/task%2F123"); return {config:req,status:200,statusText:"OK",headers:{},data}; };
 assert.equal((await requestGeneration(config,"test"))[0].dataUrl,"https://generated.invalid/result.png");assert.equal(calls,3);
 calls=0;axios.defaults.adapter=async req=>({config:req,status:200,statusText:"OK",headers:{},data:++calls===1?{task_id:"t"}:{status:"FAILURE",error:{message:"fixture failure"}}}); await assert.rejects(requestGeneration(config,"test"),/fixture failure/);assert.equal(calls,2);
 calls=0;const controller=new AbortController();axios.defaults.adapter=async req=>{calls++;if(calls===2)controller.abort();return {config:req,status:200,statusText:"OK",headers:{},data:calls===1?{task_id:"t"}:{status:"IN_PROGRESS"}};};await assert.rejects(requestGeneration(config,"test",{signal:controller.signal}));assert.equal(calls,2);
 console.log("SoonStudio async: success, failure, cancellation passed offline");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{axios.defaults.adapter=old});