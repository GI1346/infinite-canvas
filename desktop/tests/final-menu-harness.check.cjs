const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'desktop/.checks/final-menu-harness');
fs.mkdirSync(out,{recursive:true});
for(const key of ['appData','userData','sessionData','temp','logs','crashDumps']){const dir=path.join(out,key);fs.mkdirSync(dir,{recursive:true});app.setPath(key,dir);}
process.env.TEMP=process.env.TMP=path.join(out,'temp');app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
let win,runtime,finished=false;const results=[];const harnessHome=path.join(out,'Harness-'+Date.now());
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,label){for(let i=0;i<100;i++){const value=await fn();if(value)return value;await delay(100);}throw Error(label);}
async function finish(error){if(finished)return;finished=true;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:!error,results,...(error?{error:String(error.stack||error)}:{})},null,2));if(win){if(error)fs.writeFileSync(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG());win.destroy();}await runtime?.stop();app.exit(error?1:0);}
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1000,height:900,webPreferences:{backgroundThrottling:false}});
 await win.loadURL('http://127.0.0.1:3000/tests/final-menu.html');
 await waitFor(()=>win.webContents.executeJavaScript('typeof window.menuBounds === "function"'),'menu fixture did not load');
 for(const dark of [false,true])for(const scale of [0.07,0.32,1,2]){
  await win.webContents.executeJavaScript(`window.renderMenus(${scale},${dark})`);await delay(100);
  const result=await win.webContents.executeJavaScript('window.menuBounds()');assert.equal(result.items,4);assert.equal(result.overflow,false,JSON.stringify(result));assert(Math.abs(result.width-300)<1);
  results.push({check:'real CSS menu bounds',dark,...result});
 }
 fs.writeFileSync(path.join(out,'menu-dark.png'),(await win.webContents.capturePage()).toPNG());
 const start=()=>require('../harness-host.cjs').startHarness({runtimeDirectory:path.join(root,'desktop/harness-runtime'),dataDirectory:harnessHome,bridgeUrl:'http://127.0.0.1:1',bridgeToken:'offline-fixture-only',openExternal:()=>{throw Error('No real login in offline check');}});
 runtime=await start();await win.loadURL(runtime.url);
 await waitFor(()=>win.webContents.executeJavaScript('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="继续"||b.textContent.trim()==="Continue")'),'official welcome did not render');
 await win.webContents.executeJavaScript('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="继续"||b.textContent.trim()==="Continue").click()');
 await waitFor(()=>win.webContents.executeJavaScript('!document.body.textContent.includes("预览版说明")&&!document.body.textContent.includes("Preview Notice")'),'welcome did not close');
 assert.equal(await win.webContents.executeJavaScript('document.body.textContent.includes("暂时无法保存确认状态")'),false);
 await waitFor(()=>win.webContents.executeJavaScript('!!document.querySelector("textarea,[contenteditable=true]")'),'official composer did not render');
 results.push({check:'official welcome Continue and real composer',ok:true});
 fs.writeFileSync(path.join(out,'harness-after-continue.png'),(await win.webContents.capturePage()).toPNG());
 await win.loadURL('about:blank');await runtime.stop();runtime=undefined;
 runtime=await start();await win.loadURL(runtime.url);
 await waitFor(()=>win.webContents.executeJavaScript('!!document.querySelector("textarea,[contenteditable=true]")'),'composer did not return after runtime restart');
 assert.equal(await win.webContents.executeJavaScript('document.body.textContent.includes("预览版说明")'),false);
 results.push({check:'official welcome acknowledgement persisted over runtime restart',ok:true});
 fs.writeFileSync(path.join(out,'harness-restart.png'),(await win.webContents.capturePage()).toPNG());
 await win.loadURL('http://127.0.0.1:3000/tests/final-menu.html');
 const embeddedUrl=new URL(runtime.url);embeddedUrl.hash=new URLSearchParams({blinkflowHost:'http://127.0.0.1:3000'}).toString();
 await win.webContents.executeJavaScript(`document.getElementById('root').style.display='none';window.addEventListener('message',event=>{if(event.data?.channel!=='blinkflow-harness-sidebar')return;const d=event.data;if(d.kind==='request'){let result=null;if(d.method==='models.get')result={projectId:'offline',selectedImageModel:'',channels:[]};if(d.method==='references.get')result=[];if(d.method==='references.selection')result={projectId:'offline',nodes:[]};event.source.postMessage({channel:d.channel,kind:'response',value:{id:d.id,result}},event.origin);}});const iframe=document.createElement('iframe');iframe.src=${JSON.stringify(embeddedUrl.href)};iframe.style='width:500px;height:800px;border:0';document.body.append(iframe);`);
 let embeddedFrame;await waitFor(async()=>{embeddedFrame=win.webContents.mainFrame.frames.find(f=>f.url.startsWith(new URL(runtime.url).origin));if(!embeddedFrame)return false;return embeddedFrame.executeJavaScript('!!document.querySelector("textarea,[contenteditable=true]")');},'same-site official iframe did not become usable');
 assert.equal(await embeddedFrame.executeJavaScript('document.body.textContent.includes("预览版说明")||document.body.textContent.includes("暂时无法保存确认状态")'),false);
 results.push({check:'official app in same-site authenticated sidebar iframe, composer ready',ok:true});
 fs.writeFileSync(path.join(out,'harness-sidebar.png'),(await win.webContents.capturePage()).toPNG());
 await finish();
}).catch(finish);
setTimeout(()=>finish(Error('UI watchdog expired')),90000).unref();
