"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawn}=require("node:child_process");
const {setTimeout:delay}=require("node:timers/promises");
const port=57683;
const chromePaths=[process.env.CHROME_PATH,"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean);
const chrome=chromePaths.find(x=>fs.existsSync(x));
if(!chrome)throw Error("Для браузерного теста требуется Chrome или Edge");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ayureika-browser-"));
const server=spawn(process.execPath,["server.js",String(port)],{cwd:path.join(__dirname,".."),stdio:"ignore"});
const browser=spawn(chrome,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-allow-origins=*","--remote-debugging-port=0","--user-data-dir="+dir,"about:blank"],{stdio:"ignore"});
async function waitFor(fn,limit=15000){const start=Date.now();while(Date.now()-start<limit){try{const x=await fn();if(x)return x;}catch{}await delay(150);}throw Error("Время ожидания браузера истекло");}
async function run(){
 await waitFor(async()=>{const r=await fetch("http://127.0.0.1:"+port+"/");return r.ok;});
 const debug=await waitFor(()=>{const p=path.join(dir,"DevToolsActivePort");return fs.existsSync(p)?fs.readFileSync(p,"utf8").split("\n")[0]:null;});
 const targets=await waitFor(async()=>{const r=await fetch("http://127.0.0.1:"+debug+"/json/list");const d=await r.json();return d.find(x=>x.type==="page"&&x.webSocketDebuggerUrl);});
 const ws=new WebSocket(targets.webSocketDebuggerUrl);await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
 let seq=0;const pending=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(d.error.message)):p.resolve(d.result);}};
 function cmd(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const result=await cmd("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;}
 await cmd("Page.enable");await cmd("Runtime.enable");
 await cmd("Page.navigate",{url:"http://127.0.0.1:"+port+"/"});
 await waitFor(()=>evaluate("Boolean(document.querySelector('.ay-avatar') && document.querySelector('.ay-chat'))"));
 assert.equal(await evaluate("document.documentElement.lang"),"ru");
 assert.equal(await evaluate("document.querySelector('.ay-chat').hidden"),true);
 await evaluate("document.querySelector('.ay-avatar').click()");
 assert.equal(await evaluate("document.querySelector('.ay-chat').hidden"),false);
 await evaluate("document.querySelector('.ay-head button[title=\"Настройки Ayureika\"]').click()");
 await waitFor(()=>evaluate("document.querySelector('.ay-settings-page').hidden===false"));
 assert.ok(await evaluate("document.querySelectorAll('.ay-settings-link').length>=5"));
 assert.equal(await evaluate("document.querySelector('.ay-settings-header h1').textContent"),"Центр управления");
 assert.equal(await evaluate("document.querySelector('.ay-settings-context strong').textContent"),"Подключение");
 await evaluate("document.querySelector('.ay-settings-link[data-section=\\\"memory\\\"]').click()");
 assert.equal(await evaluate("document.querySelector('.ay-settings-context strong').textContent"),"Память");
 assert.ok(await evaluate("getComputedStyle(document.querySelector('.ay-settings-layout')).display==='grid'"));

 assert.equal(await evaluate("document.querySelectorAll('.ay-settings-card:not([hidden])').length"),1);
 assert.equal(await evaluate("document.querySelectorAll('.ay-settings-card:not([hidden]) .ay-settings-card-body').length"),1);
 await evaluate("document.querySelector('.ay-settings-link[data-section=\\\"chat\\\"]').click()");
 assert.equal(await evaluate("document.querySelector('.ay-settings-card:not([hidden])').id"),"ay-settings-chat");
 assert.equal(await evaluate("document.querySelectorAll('.ay-settings-card:not([hidden])').length"),1);
 assert.equal(await evaluate("document.querySelectorAll('.ay-settings-card:not([hidden]) select').length"),2);
 await evaluate("document.querySelector('.ay-settings-link[data-section=\\\"avatar\\\"]').click()");
 assert.equal(await evaluate("document.querySelector('.ay-settings-card:not([hidden])').id"),"ay-settings-avatar");
 assert.equal(await evaluate("document.querySelectorAll('.ay-avatar-controls input[type=range]').length"),2);
 assert.equal(await evaluate("document.querySelectorAll('.ay-avatar-settings').length"),0);
 assert.equal(await evaluate("document.querySelectorAll('.ay-settings-link').length"),12);
 await evaluate("document.querySelector('.ay-settings-link[data-section=\\\"conn\\\"]').click()");
 assert.ok(await evaluate("document.querySelector('.ay-settings-card:not([hidden])').textContent.includes('Проверить ответ модели')"));
 await evaluate("document.querySelector('.ay-settings-link[data-section=\\\"model\\\"]').click()");
 assert.ok(await evaluate("document.querySelector('.ay-settings-card:not([hidden])').textContent.includes('Получить список моделей')"));

 for(const section of ["conn","model","persona","memory","tools","quick","look","avatar","chat","data","diagnostics","about"]){
  await evaluate("document.querySelector('.ay-settings-link[data-section=\\\""+section+"\\\"]').click()");
  assert.equal(await evaluate("document.querySelector('.ay-settings-card:not([hidden])').id"),"ay-settings-"+section);
  assert.equal(await evaluate("document.querySelectorAll('.ay-settings-card:not([hidden])').length"),1);
 }
 assert.equal(await evaluate("localStorage.getItem('ayureika:settings:active:v2')"),"about");

 assert.ok(await evaluate("Boolean(document.querySelector('.ay-avatar-controls input[type=file]'))"));
 await evaluate("document.querySelector('.ay-settings-link[data-section=\\\"memory\\\"]').click()");
 assert.equal(await evaluate("document.querySelector('.ay-settings-card:not([hidden])').id"),"ay-settings-memory");
 assert.ok(await evaluate("document.querySelector('.ay-settings-card:not([hidden])').textContent.includes('Индексировать память')"));

 await evaluate("document.querySelector('.ay-settings-link[data-section=\\\"look\\\"]').click()");
 assert.equal(await evaluate("document.querySelector('.ay-settings-card:not([hidden])').id"),"ay-settings-look");
 await evaluate("document.querySelector('.ay-settings-nav input').value='память';document.querySelector('.ay-settings-nav input').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.ok(await evaluate("document.querySelectorAll('.ay-settings-link:not([hidden])').length>=1"));

 for(const width of [1440,1024,768,600,390,320]){
  await cmd("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:width<=760});
  await evaluate("document.querySelector('.ay-settings-nav input').value='';document.querySelector('.ay-settings-nav input').dispatchEvent(new Event('input',{bubbles:true}))");
  for(const section of ["conn","memory","avatar","chat","look"]){
   await evaluate("document.querySelector('.ay-settings-link[data-section=\\\""+section+"\\\"]').click()");
   const geometry=await evaluate("(()=>{const v=innerWidth;const els=['.ay-settings-page','.ay-settings-layout','.ay-settings-nav','.ay-settings-content','.ay-settings-card:not([hidden])'];return els.map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {sel,left:r.left,right:r.right,width:r.width,viewport:v};});})()");
   for(const g of geometry){assert.ok(g.left>=-2 && g.right<=width+2,"Layout overflow "+width+" "+section+" "+g.sel+" "+JSON.stringify(g));}
  }
 }
 await cmd("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate("document.querySelector('.ay-settings-layout').getBoundingClientRect().width<=390"));
 assert.ok(await evaluate("getComputedStyle(document.querySelector('.ay-settings-layout')).gridTemplateColumns.split(' ').length===1"));
 await evaluate("document.querySelector('.ay-settings-page button[title=\"Закрыть настройки\"]')?.click()");
 assert.ok(await evaluate("Boolean(document.querySelector('.ay-form textarea') && document.querySelector('.ay-form button[type=submit]'))"));
 await evaluate("document.querySelector('.ay-form textarea').value='Тестовый черновик';document.querySelector('.ay-form textarea').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.equal(await evaluate("localStorage.getItem('ayureika:chat:draft:v1')"),"Тестовый черновик");
 ws.close();
}
run().then(()=>console.log("Браузерный тест: чат, настройки, мобильный экран и черновик — OK")).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{browser.kill();server.kill();try{fs.rmSync(dir,{recursive:true,force:true});}catch{}});
