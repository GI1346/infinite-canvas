import assert from "node:assert/strict";
import axios, { AxiosError } from "axios";
import { fetchChannelModelDetails } from "../src/services/api/image";
import { createModelChannel } from "../src/stores/use-config-store";
const channel = createModelChannel({ name: "Soon", baseUrl: "https://api.soonstudio.ai", apiKey: "fixture", models: [] });
const old = axios.defaults.adapter;
async function main() {
 axios.defaults.adapter = async req => { assert.equal(req.url, "https://api.soonstudio.ai/v1/models"); assert.equal(req.timeout, 15000); return {config:req,status:200,statusText:"OK",headers:{},data:{data:[{id:"gpt-image-2"}]}}; };
 assert.equal((await fetchChannelModelDetails(channel))[0].name, "gpt-image-2");
 axios.defaults.adapter = async req => { throw new AxiosError("timeout", "ECONNABORTED", req); };
 await assert.rejects(fetchChannelModelDetails(channel), /读取模型列表超时/);
 console.log("model list: URL, successful response, and timeout passed offline");
}
main().catch(e => { console.error(e); process.exitCode=1; }).finally(() => { axios.defaults.adapter=old; });
