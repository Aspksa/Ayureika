const http=require("node:http");
const memory=require("./memory");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"frontend");
const dataDir=path.join(__dirname,"data");
const configPath=path.join(dataDir,"cloudru-settings.json");
const types={".png":"image/png",".webp":"image/webp",".jpg":"image/jpeg",".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"};
const defaults={endpoint:"https://foundation-models.api.cloud.ru/v1",model:"",fallbackModel:"",apiKey:"",instructions:"",memoryEnabled:true,toolsEnabled:false,quickCommands:[],embeddingModel:"",streamEnabled:true,historyLimit:20,allowedTools:["calculator","clock","memory_search"]};
function load(){try{return {...defaults,...JSON.parse(fs.readFileSync(configPath,"utf8"))};}catch{return {...defaults};}}
function save(config){fs.mkdirSync(dataDir,{recursive:true});const tmp=configPath+".tmp";fs.writeFileSync(tmp,JSON.stringify(config,null,2),{mode:0o600});fs.renameSync(tmp,configPath);}
function toolAllowed(c,name){return c.toolsEnabled&&Array.isArray(c.allowedTools)&&c.allowedTools.includes(name)&&["calculator","clock","memory_search"].includes(name);}
function publicConfig(c){const {apiKey,...safe}=c;return {...safe,keyConfigured:Boolean(apiKey||process.env.CLOUD_RU_API_KEY)};}
function json(res,code,body){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(body));}
function body(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>30e6){reject(new Error("Слишком большой запрос"));req.destroy();}});req.on("end",()=>{try{resolve(JSON.parse(s||"{}"));}catch{reject(new Error("Некорректный JSON"));}});req.on("error",reject);});}
function baseUrl(endpoint){const u=new URL(endpoint);if(u.protocol!=="https:")throw new Error("Для API требуется HTTPS");if(u.username||u.password||u.hash)throw new Error("Некорректный URL API");return u.toString().replace(/\/$/,"");}
function providerError(status){const names={400:"Неверный запрос к модели",401:"Неверный или просроченный API-ключ",402:"Недостаточно средств или доступ к оплате ограничен",403:"Доступ к модели запрещён",404:"Модель или метод API не найден",408:"Истекло время ожидания",422:"Неверные параметры модели",429:"Превышен лимит запросов",500:"Внутренняя ошибка Cloud.ru",502:"Ошибка шлюза Cloud.ru",503:"Сервис Cloud.ru временно недоступен",504:"Cloud.ru не ответил вовремя"};return (names[status]||"Ошибка Cloud.ru")+" (HTTP "+status+")";}
function networkError(e){if(e?.name==="TimeoutError"||e?.name==="AbortError")return "Превышено время ожидания Cloud.ru (90 секунд)";return "Сетевая ошибка Cloud.ru: "+(e instanceof Error?e.message:"неизвестная ошибка");}
async function cloudError(response){let detail="";try{const raw=(await response.text()).slice(0,1600);try{const data=JSON.parse(raw);const value=data?.error?.message||data?.message||data?.detail;detail=typeof value==="string"?value:"";}catch{} }catch{}return providerError(response.status)+(detail?" · "+detail.replace(/[\\r\\n]+/g," ").slice(0,300):"");}
function modelCapabilities(m){const name=typeof m?.id==="string"?m.id:"";const meta=m&&typeof m==="object"?m:{};const flag=(keys)=>{for(const k of keys)if(typeof meta[k]==="boolean")return meta[k];return null;};return {id:name,streaming:flag(["supports_streaming","streaming"]),tools:flag(["supports_tools","tool_calls","function_calling"]),embeddings:flag(["supports_embeddings","embeddings"]),source:"Метаданные /models; неизвестно означает не проверено"};}
function auth(c){return c.apiKey||process.env.CLOUD_RU_API_KEY||"";}
async function remote(c,route,options={}){
 const url=baseUrl(c.endpoint)+route,start=Date.now();let last;
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{...options,headers:{"Authorization":"Bearer "+auth(c),"Content-Type":"application/json",...(options.headers||{})},signal:AbortSignal.timeout(90000)});
   cloudHealth.latencyMs=Date.now()-start;
   if(r.ok){cloudHealth.lastSuccess=new Date().toISOString();cloudHealth.lastError="";return r;}
   cloudHealth.lastFailure=new Date().toISOString();cloudHealth.lastError=providerError(r.status);
   if(!retryable.has(r.status)||attempt===2)return r;
   last=r;await r.body?.cancel().catch(()=>{});
  }catch(e){cloudHealth.lastFailure=new Date().toISOString();cloudHealth.lastError=e instanceof Error?e.message:"Сетевая ошибка";if(attempt===2)throw e;}
  await sleep(Math.min(1500,250*2**attempt));
 }
 return last;
}
const cloudHealth={lastSuccess:null,lastFailure:null,lastError:"",latencyMs:null,requests:0,inputTokens:0,outputTokens:0};
const retryable=new Set([429,500,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pendingTools=new Map();
function allowedDefinitions(c){return toolDefs.filter(x=>toolAllowed(c,x.function.name));}
const toolDefs=[{type:"function",function:{name:"calculator",description:"Вычислить арифметическое выражение",parameters:{type:"object",properties:{input:{type:"string"}},required:["input"]}}},{type:"function",function:{name:"clock",description:"Получить текущее время UTC",parameters:{type:"object",properties:{input:{type:"string"}}}}},{type:"function",function:{name:"memory_search",description:"Поиск по сохранённой памяти",parameters:{type:"object",properties:{input:{type:"string"}},required:["input"]}}}];
async function embed(c,text){if(!c.embeddingModel)throw Error("Не выбрана модель embeddings");const r=await remote(c,"/embeddings",{method:"POST",body:JSON.stringify({model:c.embeddingModel,input:text})});if(!r.ok)throw Error("Embeddings API: "+r.status);const d=await r.json();const v=d.data?.[0]?.embedding;if(!Array.isArray(v))throw Error("Нет вектора в ответе embeddings");return v;}
async function retrieve(c,query){if(!c.memoryEnabled)return [];if(!c.embeddingModel)return memory.hybrid(query,null,"",5);
try{const vector=await embed(c,query);return memory.hybrid(query,vector,c.embeddingModel,5);}
catch{return memory.hybrid(query,null,"",5);}}
function cited(rows){return rows.map(x=>({id:x.id,content:x.content,source:memory.sourceInfo(x.id)}));}
function queueDialogFact(message){if(typeof message!=="string")return;if(message.length>500||message.length<12)return;if(/^(?:я предпочитаю|мне нравится|мой проект|я работаю|для меня важно)(?:\s|$)/iu.test(message.trim())&&!message.includes("?")){try{memory.propose(message.trim(),"Сообщение пользователя, ожидает проверки");}catch{}}}

let indexBusy=false;
const indexState={lastRun:null,lastError:"",processed:0};
async function indexTick(){
 if(indexBusy)return;const c=load();if(!c.memoryEnabled||!c.embeddingModel||!auth(c))return;
 indexBusy=true;
 try{for(const row of memory.missingVectors(c.embeddingModel,2)){try{memory.putVector(row.id,c.embeddingModel,await embed(c,row.content));indexState.processed++;indexState.lastError="";}catch(e){indexState.lastError=e instanceof Error?e.message:"Ошибка индексации";break;}}indexState.lastRun=new Date().toISOString();}
 finally{indexBusy=false;}
}
let maintenanceDay="";
function maintenanceTick(){const hour=new Date().getHours(),day=new Date().toLocaleDateString("sv-SE");if(hour===3&&maintenanceDay!==day){maintenanceDay=day;try{memory.maintenance();}catch(e){indexState.lastError="Обслуживание памяти: "+String(e);}}}
const maintenanceTimer=setInterval(maintenanceTick,60*60*1000);maintenanceTimer.unref();
const indexTimer=setInterval(()=>{void indexTick().catch(e=>{indexState.lastError=String(e);indexBusy=false;});},30000);indexTimer.unref();
function cleanupPending(){for(const [id,entry] of pendingTools)if(entry.expires<Date.now())pendingTools.delete(id);}
function stageTool(c,model,messages,answer,step){
 const calls=answer?.choices?.[0]?.message?.tool_calls;
 if(!Array.isArray(calls)||!calls.length)return null;
 if(!c.toolsEnabled)throw Error("Инструменты отключены");
 if(calls.length!==1)throw Error("Поддерживается один инструмент за шаг");
 if(step>=3)throw Error("Превышен лимит трёх вызовов инструментов за ответ");
 const call=calls[0],name=call?.function?.name;
 if(!toolAllowed(c,name))throw Error("Инструмент не разрешён");
 if(typeof call.id!=="string"||!call.id||call.id.length>150)throw Error("Неверный идентификатор вызова");
 let args;try{args=JSON.parse(call.function.arguments||"{}");}catch{throw Error("Некорректные аргументы инструмента");}
 if(!args||typeof args!=="object"||Array.isArray(args))throw Error("Некорректные аргументы");
 if(name!=="clock"&&typeof args.input!=="string")throw Error("Не указан аргумент инструмента");
 const value=name==="clock"?"":args.input;
 if(value.length>500)throw Error("Слишком длинный аргумент");
 cleanupPending();if(pendingTools.size>=100)throw Error("Слишком много ожидающих подтверждений");
 const id=require("node:crypto").randomUUID();
 pendingTools.set(id,{name,input:value,expires:Date.now()+120000,model,messages:[...messages,answer.choices[0].message],callId:call.id,step});
 return {confirmation:{id,name,input:value}};
}
function trackUsage(answer){const u=answer?.usage;if(!u)return;cloudHealth.requests++;cloudHealth.inputTokens+=Number(u.prompt_tokens)||0;cloudHealth.outputTokens+=Number(u.completion_tokens)||0;}
async function complete(c,model,messages){
 const payload={model,messages,stream:false,...(c.toolsEnabled&&allowedDefinitions(c).length?{tools:allowedDefinitions(c),tool_choice:"auto"}:{})};
 let response=await remote(c,"/chat/completions",{method:"POST",body:JSON.stringify(payload)});
 if(!response.ok)throw Error("Провайдер ИИ вернул ошибку "+response.status);
 const answer=await response.json();trackUsage(answer);return answer;
}
async function handler(req,res){
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}catch{return json(res,400,{error:"Некорректный адрес"});}
 if(pathname.startsWith("/api/")){
  try{
   if(pathname==="/api/settings"&&req.method==="GET")return json(res,200,publicConfig(load()));
   if(pathname==="/api/settings"&&req.method==="PATCH"){
    const patch=await body(req),allowed=["endpoint","model","fallbackModel","instructions","memoryEnabled","toolsEnabled","quickCommands","embeddingModel","streamEnabled","historyLimit","allowedTools","apiKey"];const c=load();
    for(const key of allowed)if(Object.hasOwn(patch,key)){
     const v=patch[key];
     if(key==="apiKey"){if(typeof v!=="string"||v.length>4096)throw Error("Неверный ключ");if(v)c.apiKey=v;else if(patch.clearApiKey===true)c.apiKey="";}
     else if(["memoryEnabled","toolsEnabled","streamEnabled"].includes(key)){if(typeof v!=="boolean")throw Error("Ожидалось да/нет");c[key]=v;}
     else if(key==="historyLimit"){if(!Number.isInteger(v)||v<0||v>20)throw Error("История: от 0 до 20 сообщений");c[key]=v;}
     else if(key==="allowedTools"){if(!Array.isArray(v)||v.length>3||v.some(x=>!["calculator","clock","memory_search"].includes(x))||new Set(v).size!==v.length)throw Error("Недопустимые разрешения инструментов");c[key]=v;}
     else if(key==="quickCommands"){if(!Array.isArray(v)||v.length>30||v.some(x=>typeof x.name!=="string"||typeof x.text!=="string"||x.name.length>32||x.text.length>2000))throw Error("Неверные команды");c[key]=v;}
     else{if(typeof v!=="string"||v.length>(key==="instructions"?6000:500))throw Error("Недопустимое значение");c[key]=v.trim();}
    }
    if(c.endpoint)baseUrl(c.endpoint);
    save(c);return json(res,200,publicConfig(c));
   }
   if(pathname==="/api/diagnostics"&&req.method==="GET"){
    const c=load(),db=memory.stats(c.embeddingModel);
    return json(res,200,{server:"ok",sqlite:"ok",memory:db,cloudConfigured:Boolean(c.endpoint&&auth(c)&&c.model),cloud:cloudHealth,indexing:{...indexState,pending:memory.pendingVectors(c.embeddingModel),enabled:Boolean(c.memoryEnabled&&c.embeddingModel&&auth(c)),busy:indexBusy},streamEnabled:c.streamEnabled,toolsEnabled:c.toolsEnabled});
   }
   if(pathname==="/api/memory/monitor"&&req.method==="GET"){const c=load();return json(res,200,{...indexState,pending:memory.pendingVectors(c.embeddingModel),enabled:Boolean(c.memoryEnabled&&c.embeddingModel&&auth(c)),busy:indexBusy,reviews:memory.stats(c.embeddingModel).pendingReviews,cloud:{...cloudHealth}});}
   if(pathname==="/api/memory/reviews"&&req.method==="GET")return json(res,200,{items:memory.reviews()});
   if(pathname==="/api/memory/reviews"&&req.method==="POST"){const d=await body(req);if(d.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,{updated:memory.reviewDecision(d.id,d.status)});}
   if(pathname==="/api/memory/versions"&&req.method==="POST"){const d=await body(req);return json(res,200,{items:memory.versions(d.id)});}
   if(pathname==="/api/memory/revise"&&req.method==="POST"){const d=await body(req);if(d.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,memory.revise(d.id,d.content));}
   if(pathname==="/api/memory/stats"&&req.method==="GET"){const c=load();return json(res,200,memory.stats(c.embeddingModel));}
   if(pathname==="/api/data/full-export"&&req.method==="GET"){const backup=memory.fullBackup();return json(res,200,{...backup,settings:publicConfig(load())});}
   if(pathname==="/api/data/full-import"&&req.method==="POST"){const d=await body(req);if(d.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,memory.restoreFull(d));}
   if(pathname==="/api/data/export"&&req.method==="GET"){const c=load();return json(res,200,{kind:"ayureika-server-backup",version:1,settings:publicConfig(c),facts:memory.list().map(x=>x.content),note:"API-ключ не включён. Экспортируются последние 100 записей памяти."});}
   if(pathname==="/api/data/import"&&req.method==="POST"){
    const input=await body(req);if(input.confirm!==true||input.kind!=="ayureika-server-backup"||input.version!==1)return json(res,400,{error:"Неверная резервная копия или нет подтверждения"});
    if(!Array.isArray(input.facts)||input.facts.length>100)return json(res,400,{error:"Неверный список памяти"});
    const safe=input.settings;
    const patch={};
    if(safe&&typeof safe==="object"&&!Array.isArray(safe)){
     for(const key of ["endpoint","model","fallbackModel","embeddingModel","instructions"]){if(Object.hasOwn(safe,key)){if(typeof safe[key]!=="string"||safe[key].length>(key==="instructions"?6000:500))throw Error("Неверные настройки: "+key);patch[key]=safe[key];}}
     for(const key of ["memoryEnabled","toolsEnabled","streamEnabled"]){if(Object.hasOwn(safe,key)){if(typeof safe[key]!=="boolean")throw Error("Неверные настройки: "+key);patch[key]=safe[key];}}
     if(Object.hasOwn(safe,"historyLimit")){if(!Number.isInteger(safe.historyLimit)||safe.historyLimit<0||safe.historyLimit>20)throw Error("Неверный лимит истории");patch.historyLimit=safe.historyLimit;}
     if(Object.hasOwn(safe,"allowedTools")){if(!Array.isArray(safe.allowedTools)||safe.allowedTools.some(x=>!["calculator","clock","memory_search"].includes(x))||new Set(safe.allowedTools).size!==safe.allowedTools.length)throw Error("Неверные разрешения");patch.allowedTools=safe.allowedTools;}
     if(Object.hasOwn(safe,"quickCommands")){if(!Array.isArray(safe.quickCommands)||safe.quickCommands.length>30||safe.quickCommands.some(x=>!x||typeof x.name!=="string"||typeof x.text!=="string"||x.name.length>32||x.text.length>2000))throw Error("Неверные команды");patch.quickCommands=safe.quickCommands;}
     if(patch.endpoint)baseUrl(patch.endpoint);
    }
    const count=memory.importFacts(input.facts);if(Object.keys(patch).length)save({...load(),...patch});return json(res,200,{imported:count,settingsRestored:Object.keys(patch).length>0});
   }
   if(pathname==="/api/memory/candidates"&&req.method==="GET")return json(res,200,{items:memory.candidates()});
   if(pathname==="/api/memory/candidates"&&req.method==="POST"){const d=await body(req);if(d.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,memory.decideCandidate(d.id,d.approve));}
   if(pathname==="/api/memory/links"&&req.method==="GET"){const id=new URL(req.url,"http://localhost").searchParams.get("id");return json(res,200,{items:memory.links(id)});}
   if(pathname==="/api/memory/links"&&req.method==="POST"){const d=await body(req);if(d.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,memory.link(d.from,d.to,d.relation));}
   if(pathname==="/api/memory/source"&&req.method==="GET"){const id=new URL(req.url,"http://localhost").searchParams.get("id");return json(res,200,memory.sourceInfo(id));}
   if(pathname==="/api/memory/source"&&req.method==="POST"){const d=await body(req);if(d.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,memory.annotate(d.id,d.source,d.confidence));}
   if(pathname==="/api/memory/journal"&&req.method==="GET")return json(res,200,{items:memory.journal()});
   if(pathname==="/api/memory/maintenance"&&req.method==="POST"){const d=await body(req);if(d.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,memory.maintenance());}
   if(pathname==="/api/memory"&&req.method==="GET")return json(res,200,{items:memory.list()});
   if(pathname==="/api/memory"&&req.method==="POST"){const c=load();if(!c.memoryEnabled)return json(res,403,{error:"Память отключена"});const input=await body(req);return json(res,200,memory.remember(input.content));}
   if(pathname==="/api/memory/reindex"&&req.method==="POST"){const c=load();if(!c.memoryEnabled||!c.embeddingModel)return json(res,400,{error:"Включите память и укажите модель embeddings"});const rows=memory.missingVectors(c.embeddingModel,20);let indexed=0;for(const row of rows){memory.putVector(row.id,c.embeddingModel,await embed(c,row.content));indexed++;}return json(res,200,{indexed,remaining:memory.missingVectors(c.embeddingModel,1).length>0});}
   if(pathname==="/api/memory/relevant"&&req.method==="POST"){const c=load();if(!c.memoryEnabled)return json(res,403,{error:"Память отключена"});const input=await body(req);return json(res,200,{items:await retrieve(c,input.query)});}
   if(pathname==="/api/memory/search"&&req.method==="POST"){const c=load();if(!c.memoryEnabled)return json(res,403,{error:"Память отключена"});const input=await body(req);return json(res,200,{items:memory.search(input.query)});}
   if(pathname==="/api/memory/delete"&&req.method==="POST"){const input=await body(req);if(input.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,{deleted:memory.forget(input.id)});}
   if(pathname==="/api/tools"&&req.method==="GET")return json(res,200,{available:["calculator","clock","memory_search"],audit:memory.logs()});
   if(pathname==="/api/tools/run"&&req.method==="POST"){const c=load();const input=await body(req);if(!toolAllowed(c,input.name))return json(res,403,{error:"Инструмент запрещён настройками"});return json(res,200,memory.execute(input.name,input.input,input.confirm===true));}
   if(pathname==="/api/tools/approve"&&req.method==="POST"){
    const c=load(),input=await body(req);cleanupPending();
    if(typeof input.id!=="string")return json(res,400,{error:"Неверный запрос"});
    const pending=pendingTools.get(input.id);
    if(!pending)return json(res,404,{error:"Запрос инструмента истёк"});
    pendingTools.delete(input.id);
    if(input.approve!==true)return json(res,200,{reply:"Выполнение инструмента отменено."});
    if(!toolAllowed(c,pending.name))return json(res,403,{error:"Инструмент запрещён настройками"});
    const result=memory.execute(pending.name,pending.input,true);
    const messages=[...pending.messages,{role:"tool",tool_call_id:pending.callId,content:result.output}];
    try{
     const response=await complete(c,pending.model,messages);
     const staged=stageTool(c,pending.model,messages,response,pending.step+1);
     if(staged)return json(res,200,{...staged,toolResult:result});
     const reply=response.choices?.[0]?.message?.content;
     if(typeof reply!=="string")return json(res,502,{error:"Модель не вернула текст после инструмента"});
     return json(res,200,{reply,model:pending.model,toolResult:result});
    }catch(e){return json(res,502,{error:"Инструмент выполнен, но продолжение ответа не удалось: "+(e instanceof Error?e.message:"ошибка"),toolResult:result});}
   }
   if(pathname==="/api/cloud/check"&&req.method==="GET"){
    const c=load();if(!auth(c))return json(res,200,{ok:false,stage:"key",code:"NO_KEY",error:"Укажите API-ключ Cloud.ru"});
    try{
     const r=await remote(c,"/models");if(!r.ok)return json(res,200,{ok:false,stage:"models",status:r.status,error:await cloudError(r)});
     const d=await r.json();if(!Array.isArray(d.data))return json(res,200,{ok:false,stage:"models",error:"Cloud.ru вернул неожиданный формат списка моделей"});
     const available=d.data.filter(x=>typeof x?.id==="string").map(x=>x.id);
     return json(res,200,{ok:true,stage:"models",models:available.length,selectedModel:c.model,modelAvailable:Boolean(c.model&&available.includes(c.model)),modelConfigured:Boolean(c.model),message:c.model?(available.includes(c.model)?"Модель найдена. Для проверки ответов запустите тест чата.":"Модель не найдена в списке Cloud.ru. Проверьте её идентификатор."):"Выберите модель для чата."});
    }catch(e){return json(res,200,{ok:false,stage:"network",error:networkError(e)});}
   }
   if(pathname==="/api/cloud/test"&&req.method==="POST"){
    const c=load();if(!auth(c))return json(res,200,{ok:false,stage:"key",error:"Укажите API-ключ Cloud.ru"});
    if(!c.model)return json(res,200,{ok:false,stage:"model",error:"Выберите основную модель"});
    try{
     const r=await remote(c,"/chat/completions",{method:"POST",body:JSON.stringify({model:c.model,messages:[{role:"user",content:"Ответь одним словом: OK"}],stream:false,max_tokens:16})});
     if(!r.ok)return json(res,200,{ok:false,stage:"chat",status:r.status,error:await cloudError(r)});
     const d=await r.json();const answer=d.choices?.[0]?.message?.content;
     if(typeof answer!=="string"||!answer.trim())return json(res,200,{ok:false,stage:"chat",error:"Cloud.ru ответил, но не вернул текст сообщения"});
     trackUsage(d);return json(res,200,{ok:true,stage:"chat",model:c.model,message:"Тестовый ответ модели получен",reply:answer.slice(0,100)});
    }catch(e){return json(res,200,{ok:false,stage:"network",error:networkError(e)});}
   }
   if(pathname==="/api/cloud/models"&&req.method==="GET"){
    const c=load();const manual=[c.model,c.fallbackModel,...(process.env.CLOUD_RU_MODELS||"").split(",")].filter(x=>typeof x==="string"&&x.trim()).map(x=>x.trim());
    let available=[],warning="",capabilities=[];
    if(c.endpoint&&auth(c)){try{
     const upstream=await remote(c,"/models");
     if(upstream.ok){const d=await upstream.json();if(Array.isArray(d.data)){const rows=d.data.filter(x=>typeof x?.id==="string");available=[...new Set(rows.map(x=>x.id))];capabilities=rows.map(modelCapabilities);}else warning="Неожиданный формат ответа Cloud.ru";}
     else warning=await cloudError(upstream);
    }catch(e){warning=networkError(e);}}
    else warning="Укажите API-ключ Cloud.ru для получения доступных моделей";
    return json(res,200,{models:available,available,manual:[...new Set(manual.filter(x=>!available.includes(x)))],capabilities,configured:Boolean(c.endpoint&&auth(c)),warning});
   }
   if(pathname==="/api/health"&&req.method==="GET"){const c=load();return json(res,200,{server:true,endpointConfigured:Boolean(c.endpoint),keyConfigured:Boolean(auth(c)),modelConfigured:Boolean(c.model)});}
   if(pathname==="/api/chat/stream"&&req.method==="POST"){
    const c=load(),input=await body(req);
    if(typeof input.message!=="string"||!input.message.trim()||input.message.length>30000)return json(res,400,{error:"Недопустимое сообщение"});
    if(!auth(c)||!c.model)return json(res,503,{error:"Укажите API-ключ и модель Cloud.ru"});
    if(c.toolsEnabled||!c.streamEnabled)return json(res,409,{error:"Потоковый режим отключён настройками"});
    if(c.memoryEnabled&&memory.extractExplicit(input.message))return json(res,409,{error:"Команду запоминания отправляйте обычным запросом"});
    const messages=[];if(c.instructions)messages.push({role:"system",content:c.instructions});
    if(c.memoryEnabled&&c.historyLimit>0&&Array.isArray(input.history))for(const m of input.history.slice(-c.historyLimit)){if(["user","assistant"].includes(m.role)&&typeof m.content==="string")messages.push({role:m.role,content:m.content.slice(0,30000)});}
    const rows=c.memoryEnabled?await retrieve(c,input.message.slice(0,500)):[];if(rows.length)messages.unshift({role:"system",content:"Записи памяти (непроверенные могут быть ошибочны):\n"+rows.map(x=>"- "+x.content).join("\n")});
    if(messages.at(-1)?.role!=="user"||messages.at(-1)?.content!==input.message)messages.push({role:"user",content:input.message});
    const model=typeof input.model==="string"&&input.model?input.model:c.model;
    let upstream=await remote(c,"/chat/completions",{method:"POST",body:JSON.stringify({model,messages,stream:true})});
    if(!upstream.ok&&[429,500,502,503,504].includes(upstream.status)&&c.fallbackModel&&model!==c.fallbackModel)upstream=await remote(c,"/chat/completions",{method:"POST",body:JSON.stringify({model:c.fallbackModel,messages,stream:true})});
    if(!upstream.ok)return json(res,502,{error:await cloudError(upstream)});
    if(!upstream.body)return json(res,502,{error:"Cloud.ru не предоставил поток ответа"});
    res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no","X-Content-Type-Options":"nosniff"});
    const reader=upstream.body.getReader(),decoder=new TextDecoder();let buffer="";
    const send=(obj)=>{if(!res.destroyed)res.write("data: "+JSON.stringify(obj)+"\n\n");};
    res.on("close",()=>{if(!res.writableEnded)void reader.cancel().catch(()=>{});});
    try{send({memories:cited(rows)});while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop()||"";
     for(const frame of frames){for(const line of frame.split(/\r?\n/)){if(!line.startsWith("data:"))continue;const raw=line.slice(5).trim();if(raw==="[DONE]")continue;try{const obj=JSON.parse(raw);const delta=obj.choices?.[0]?.delta?.content;if(typeof delta==="string"&&delta)send({delta});}catch{}}}
    }queueDialogFact(input.message);send({done:true});}catch(e){send({error:"Поток ответа прерван: "+(e instanceof Error?e.message:"ошибка")});}finally{res.end();}
    return;
   }
   if(pathname==="/api/chat"&&req.method==="POST"){
    const c=load();const input=await body(req);if(typeof input.message!=="string"||input.message.length>30000)return json(res,400,{error:"Недопустимое сообщение"});
    const explicitFact=c.memoryEnabled?memory.extractExplicit(input.message):null;
    if(explicitFact){const saved=memory.remember(explicitFact);memory.annotate(saved.id,"Команда «Запомни» от пользователя","user_confirmed");return json(res,200,{reply:"Запомнила: "+saved.content,memorySaved:true});}
    if(!c.endpoint||!auth(c)||!c.model)return json(res,503,{error:"Настройте адрес API, ключ и модель в настройках."});
    const messages=[];if(c.instructions)messages.push({role:"system",content:c.instructions});
    if(c.memoryEnabled&&c.historyLimit>0&&Array.isArray(input.history))for(const m of input.history.slice(-c.historyLimit)){if(["user","assistant"].includes(m.role)&&typeof m.content==="string")messages.push({role:m.role,content:m.content.slice(0,30000)});}
    const remembered=c.memoryEnabled?await retrieve(c,input.message.slice(0,500)):[];if(remembered.length)messages.unshift({role:"system",content:"Записи памяти (проверяйте достоверность):\n"+remembered.map(x=>"- "+x.content).join("\n")});
    if(messages.at(-1)?.role!=="user"||messages.at(-1)?.content!==input.message)messages.push({role:"user",content:input.message});
    let upstream;let chosen=typeof input.model==="string"&&input.model?input.model:c.model;
    const payload=model=>({model,messages,stream:false,...(c.toolsEnabled&&allowedDefinitions(c).length?{tools:allowedDefinitions(c),tool_choice:"auto"}:{})});
    upstream=await remote(c,"/chat/completions",{method:"POST",body:JSON.stringify(payload(chosen))});
    if(!upstream.ok&&[429,500,502,503,504].includes(upstream.status)&&c.fallbackModel&&chosen!==c.fallbackModel){chosen=c.fallbackModel;upstream=await remote(c,"/chat/completions",{method:"POST",body:JSON.stringify(payload(chosen))});}
    if(!upstream.ok)return json(res,502,{error:providerError(upstream.status)});
    const response=await upstream.json();trackUsage(response);
    const staged=stageTool(c,chosen,messages,response,0);
    if(staged)return json(res,200,staged);
    const reply=response.choices?.[0]?.message?.content;
    if(typeof reply!=="string")return json(res,502,{error:"Неожиданный ответ модели"});
    queueDialogFact(input.message);return json(res,200,{reply,model:chosen,memories:cited(remembered)});
   }
   return json(res,404,{error:"Неизвестный API"});
  }catch(e){return json(res,400,{error:e instanceof Error?e.message:"Ошибка сервера"});}
 }
 if(req.method!=="GET")return json(res,405,{error:"Метод не поддерживается"});
 const file=path.resolve(root,"."+(pathname==="/"?"/index.html":pathname));
 if(file!==path.join(root,"index.html")&&!file.startsWith(root+path.sep))return json(res,403,{error:"Доступ запрещён"});
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","X-Content-Type-Options":"nosniff"});res.end(data);});
}
http.createServer((req,res)=>{void handler(req,res);}).listen(Number(process.argv[2])||57474,"127.0.0.1");
