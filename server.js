const http=require("node:http");
const memory=require("./memory");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"frontend");
const dataDir=path.join(__dirname,"data");
const configPath=path.join(dataDir,"cloudru-settings.json");
const types={".png":"image/png",".webp":"image/webp",".jpg":"image/jpeg",".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"};
const defaults={endpoint:"",model:"",fallbackModel:"",apiKey:"",instructions:"",memoryEnabled:true,toolsEnabled:false,quickCommands:[]};
function load(){try{return {...defaults,...JSON.parse(fs.readFileSync(configPath,"utf8"))};}catch{return {...defaults};}}
function save(config){fs.mkdirSync(dataDir,{recursive:true});const tmp=configPath+".tmp";fs.writeFileSync(tmp,JSON.stringify(config,null,2),{mode:0o600});fs.renameSync(tmp,configPath);}
function publicConfig(c){const {apiKey,...safe}=c;return {...safe,keyConfigured:Boolean(apiKey||process.env.CLOUD_RU_API_KEY)};}
function json(res,code,body){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(body));}
function body(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>2e6){reject(new Error("Слишком большой запрос"));req.destroy();}});req.on("end",()=>{try{resolve(JSON.parse(s||"{}"));}catch{reject(new Error("Некорректный JSON"));}});req.on("error",reject);});}
function baseUrl(endpoint){const u=new URL(endpoint);if(u.protocol!=="https:")throw new Error("Для API требуется HTTPS");if(u.username||u.password||u.hash)throw new Error("Некорректный URL API");return u.toString().replace(/\/$/,"");}
function auth(c){return c.apiKey||process.env.CLOUD_RU_API_KEY||"";}
async function remote(c,route,options={}){const url=baseUrl(c.endpoint)+route;const r=await fetch(url,{...options,headers:{"Authorization":"Bearer "+auth(c),"Content-Type":"application/json",...(options.headers||{})},signal:AbortSignal.timeout(90000)});return r;}
async function handler(req,res){
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}catch{return json(res,400,{error:"Некорректный адрес"});}
 if(pathname.startsWith("/api/")){
  try{
   if(pathname==="/api/settings"&&req.method==="GET")return json(res,200,publicConfig(load()));
   if(pathname==="/api/settings"&&req.method==="PATCH"){
    const patch=await body(req),allowed=["endpoint","model","fallbackModel","instructions","memoryEnabled","toolsEnabled","quickCommands","apiKey"];const c=load();
    for(const key of allowed)if(Object.hasOwn(patch,key)){
     const v=patch[key];
     if(key==="apiKey"){if(typeof v!=="string"||v.length>4096)throw Error("Неверный ключ");if(v)c.apiKey=v;else if(patch.clearApiKey===true)c.apiKey="";}
     else if(["memoryEnabled","toolsEnabled"].includes(key)){if(typeof v!=="boolean")throw Error("Ожидалось да/нет");c[key]=v;}
     else if(key==="quickCommands"){if(!Array.isArray(v)||v.length>30||v.some(x=>typeof x.name!=="string"||typeof x.text!=="string"||x.name.length>32||x.text.length>2000))throw Error("Неверные команды");c[key]=v;}
     else{if(typeof v!=="string"||v.length>(key==="instructions"?6000:500))throw Error("Недопустимое значение");c[key]=v.trim();}
    }
    if(c.endpoint)baseUrl(c.endpoint);
    save(c);return json(res,200,publicConfig(c));
   }
   if(pathname==="/api/memory"&&req.method==="GET")return json(res,200,{items:memory.list()});
   if(pathname==="/api/memory"&&req.method==="POST"){const c=load();if(!c.memoryEnabled)return json(res,403,{error:"Память отключена"});const input=await body(req);return json(res,200,memory.remember(input.content));}
   if(pathname==="/api/memory/search"&&req.method==="POST"){const c=load();if(!c.memoryEnabled)return json(res,403,{error:"Память отключена"});const input=await body(req);return json(res,200,{items:memory.search(input.query)});}
   if(pathname==="/api/memory/delete"&&req.method==="POST"){const input=await body(req);if(input.confirm!==true)return json(res,403,{error:"Требуется подтверждение"});return json(res,200,{deleted:memory.forget(input.id)});}
   if(pathname==="/api/tools"&&req.method==="GET")return json(res,200,{available:["calculator","clock","memory_search"],audit:memory.logs()});
   if(pathname==="/api/tools/run"&&req.method==="POST"){const c=load();if(!c.toolsEnabled)return json(res,403,{error:"Инструменты отключены"});const input=await body(req);return json(res,200,memory.execute(input.name,input.input,input.confirm===true));}
   if(pathname==="/api/cloud/models"&&req.method==="GET"){
    const c=load();let models=(process.env.CLOUD_RU_MODELS||"").split(",").map(s=>s.trim()).filter(Boolean);
    if(c.endpoint&&auth(c)){try{const upstream=await remote(c,"/models");if(upstream.ok){const d=await upstream.json();if(Array.isArray(d.data))models=[...new Set([...models,...d.data.map(x=>x.id).filter(x=>typeof x==="string")])];}}catch{}}
    return json(res,200,{models:[...new Set([c.model,c.fallbackModel,...models].filter(Boolean))],configured:Boolean(c.endpoint&&auth(c))});
   }
   if(pathname==="/api/health"&&req.method==="GET"){const c=load();return json(res,200,{server:true,endpointConfigured:Boolean(c.endpoint),keyConfigured:Boolean(auth(c)),modelConfigured:Boolean(c.model)});}
   if(pathname==="/api/chat"&&req.method==="POST"){
    const c=load();if(!c.endpoint||!auth(c)||!c.model)return json(res,503,{error:"Настройте адрес API, ключ и модель в настройках."});
    const input=await body(req);if(typeof input.message!=="string"||input.message.length>30000)return json(res,400,{error:"Недопустимое сообщение"});
    const messages=[];if(c.instructions)messages.push({role:"system",content:c.instructions});
    if(c.memoryEnabled&&Array.isArray(input.history))for(const m of input.history.slice(-20)){if(["user","assistant"].includes(m.role)&&typeof m.content==="string")messages.push({role:m.role,content:m.content.slice(0,30000)});}
    if(c.memoryEnabled){const remembered=memory.search(input.message.slice(0,150),5);if(remembered.length)messages.unshift({role:"system",content:"Подтверждённые записи памяти пользователя:\\n"+remembered.map(x=>"- "+x.content).join("\\n")});}
    if(messages.at(-1)?.role!=="user"||messages.at(-1)?.content!==input.message)messages.push({role:"user",content:input.message});
    let upstream;let chosen=typeof input.model==="string"&&input.model?input.model:c.model;
    const payload=model=>({model,messages,stream:false});
    upstream=await remote(c,"/chat/completions",{method:"POST",body:JSON.stringify(payload(chosen))});
    if(!upstream.ok&&[429,500,502,503,504].includes(upstream.status)&&c.fallbackModel&&chosen!==c.fallbackModel){chosen=c.fallbackModel;upstream=await remote(c,"/chat/completions",{method:"POST",body:JSON.stringify(payload(chosen))});}
    if(!upstream.ok)return json(res,502,{error:"Провайдер ИИ вернул ошибку "+upstream.status});
    const response=await upstream.json();const reply=response.choices?.[0]?.message?.content;
    if(typeof reply!=="string")return json(res,502,{error:"Неожиданный ответ модели"});
    return json(res,200,{reply,model:chosen});
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
