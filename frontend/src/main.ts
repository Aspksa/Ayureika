(() => {
type Message = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; messages: Message[] };
const KEY = "ayureika:chat:v2", OLD_KEY = "ayureika:chat:v1", POS = "ayureika:avatar:position", PREFS = "ayureika:avatar:preferences", AVATAR_IMAGE = "ayureika:avatar:image:v1";
const CHAT_RECT = "ayureika:chat:rect", MODEL_KEY = "ayureika:chat:model", DRAFT_KEY = "ayureika:chat:draft:v1";
function makeChat(): Conversation { return { id: String(Date.now()) + Math.random().toString(36).slice(2), title: "Новый чат", messages: [] }; }
let chats: Conversation[] = [];
try {
  const saved: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
  if (Array.isArray(saved)) chats = saved.filter((c: Conversation) => c && typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.messages)).slice(0,100);
  if (!chats.length) {
    const legacy: unknown = JSON.parse(localStorage.getItem(OLD_KEY) || "[]");
    if (Array.isArray(legacy) && legacy.length) { const c = makeChat(); c.messages = legacy.filter((m: Message) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"); c.title = "Прежняя переписка"; chats.push(c); }
  }
} catch {}
if (!chats.length) chats.push(makeChat());
let current = chats[0]!.id;
function conv() { return chats.find(c => c.id === current) || chats[0]!; }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0,100))); } catch { status.textContent = "Не удалось сохранить историю. Сделайте резервную копию чатов."; } }
function button(text: string, title = text) { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.title = title; return b; }
const avatar = button("", "Открыть чат · перетащите для перемещения");
avatar.className = "ay-avatar"; avatar.setAttribute("aria-label","Открыть чат Ayureika");
const img = document.createElement("img"); img.src = "/assets/avatar.png"; img.alt = ""; img.draggable = false;
const fallback = document.createElement("span"); fallback.className = "ay-fallback"; fallback.textContent = "А";
img.onload = () => { fallback.hidden = true; img.hidden = false; };
img.onerror = () => { fallback.hidden = false; img.hidden = true; };
try { const savedImage = localStorage.getItem(AVATAR_IMAGE); if (savedImage && /^data:image\/(png|jpeg|webp);base64,/.test(savedImage)) img.src = savedImage; } catch {}
const busyBadge = document.createElement("span"); busyBadge.className = "ay-busy"; busyBadge.hidden = true; busyBadge.title = "ИИ обрабатывает запрос";
avatar.append(fallback,img,busyBadge);
const panel = document.createElement("section"); panel.className = "ay-chat"; panel.hidden = true; panel.setAttribute("aria-label","Чат Ayureika");
const side = document.createElement("aside"); side.className = "ay-side";
const newChat = button("+ Новый чат"); const search = document.createElement("input"); search.type = "search"; search.placeholder = "Поиск по перепискам"; search.setAttribute("aria-label","Поиск по перепискам");
const list = document.createElement("nav"); list.className = "ay-chat-list"; side.append(newChat,search,list);
const main = document.createElement("div"); main.className = "ay-chat-main";
const head = document.createElement("header"); head.className = "ay-head";
const title = document.createElement("strong"); title.textContent = "Ayureika";
const modelSelect = document.createElement("select"); modelSelect.title = "Модель Cloud.ru"; modelSelect.setAttribute("aria-label","Модель Cloud.ru");
const modelSearch = document.createElement("input"); modelSearch.type = "search"; modelSearch.placeholder = "Поиск модели"; modelSearch.setAttribute("aria-label","Поиск модели");
const context = document.createElement("span"); context.className = "ay-context"; context.title = "Приблизительная длина отправляемой истории, не точный подсчёт токенов";
const maximize = button("□","На весь экран"); const close = button("×","Закрыть чат");
head.append(title,modelSearch,modelSelect,context,maximize,close);
const thread = document.createElement("div"); thread.className = "ay-thread"; thread.setAttribute("role","log"); thread.setAttribute("aria-live","polite");
const form = document.createElement("form"); form.className = "ay-form";
const input = document.createElement("textarea"); input.rows = 2; input.placeholder = "Сообщение…"; input.setAttribute("aria-label","Сообщение");
const send = document.createElement("button"); send.type = "submit"; send.textContent = "Отправить";
try{input.value=localStorage.getItem(DRAFT_KEY)||"";}catch{}
const stop = button("Стоп"); stop.hidden = true;
const status = document.createElement("p"); status.className = "ay-status"; status.setAttribute("role","status");
const sources=document.createElement("details");sources.className="ay-memory-sources";const sourcesTitle=document.createElement("summary");sourcesTitle.textContent="Использованные воспоминания";const sourcesList=document.createElement("div");sources.append(sourcesTitle,sourcesList);sources.hidden=true;
form.append(input,send,stop); main.append(head,thread,sources,form,status); panel.append(side,main); document.body.append(avatar,panel);
function showSources(rows:{id:string;content:string;source?:{source:string;confidence:string}}[]){sourcesList.replaceChildren();sources.hidden=!rows.length;for(const row of rows){const el=document.createElement("p");el.textContent=row.content+" · Источник: "+(row.source?.source||"не указан")+" · Проверка: "+(row.source?.confidence||"не проверено");sourcesList.append(el);}}
function updateContext() {
  const chars = conv().messages.slice(-Math.max(1,remoteSettings.historyLimit)).reduce((n,m)=>n+m.content.length,0)+input.value.length;
  context.textContent = "≈ " + Math.ceil(chars/4) + " ток.";
}
function renderMarkdown(source: string): DocumentFragment {
  const root = document.createDocumentFragment();
  // Render text with safe DOM APIs, never inject untrusted HTML.
  const lines = source.split(/(```[^\n]*\n[\s\S]*?```)/g);
  for (const part of lines) {
    if (!part) continue;
    if (part.startsWith("```")) {
      const newline = part.indexOf("\n"); const lang = part.slice(3,newline).trim();
      const code = document.createElement("code"); code.className = "ay-code"; code.dataset.language = lang;
      code.textContent = part.slice(newline+1,-3).replace(/\n$/,"");
      const pre = document.createElement("pre"); pre.append(code); root.append(pre);
    } else {
      const chunks = part.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
      for (const chunk of chunks) {
        if (chunk.startsWith("**") && chunk.endsWith("**")) { const strong = document.createElement("strong"); strong.textContent = chunk.slice(2,-2); root.append(strong); }
        else if (chunk.startsWith("`") && chunk.endsWith("`")) { const code = document.createElement("code"); code.textContent = chunk.slice(1,-1); root.append(code); }
        else root.append(document.createTextNode(chunk));
      }
    }
  }
  return root;
}
function paint() {
  thread.replaceChildren();
  for (const m of conv().messages) { const el = document.createElement("div"); el.className = "ay-msg "+m.role; el.append(renderMarkdown(m.content)); thread.append(el); }
  thread.scrollTop = thread.scrollHeight; updateContext();
}
function renderList() {
  list.replaceChildren(); const q = search.value.toLowerCase().trim();
  for (const c of chats) {
    if (q && !c.title.toLowerCase().includes(q) && !c.messages.some(m=>m.content.toLowerCase().includes(q))) continue;
    const row = document.createElement("div"); row.className = "ay-chat-row"+(c.id===current?" active":"");
    const open = button(c.title); open.className = "ay-chat-name"; open.onclick = () => { current = c.id; renderList(); paint(); };
    const rename = button("✎","Переименовать"); rename.onclick = () => { const name = prompt("Название чата",c.title)?.trim(); if(name){c.title=name.slice(0,100);persist();renderList();} };
    const del = button("×","Удалить"); del.onclick = () => { if(!confirm("Удалить чат «"+c.title+"»?"))return; chats=chats.filter(x=>x.id!==c.id); if(!chats.length)chats=[makeChat()]; if(current===c.id)current=chats[0]!.id; persist();renderList();paint(); };
    row.append(open,rename,del); list.append(row);
  }
}
newChat.onclick = () => { if(active) return; const c=makeChat(); chats.unshift(c);current=c.id;persist();renderList();paint();input.focus(); };
search.oninput=renderList;
function openChat() { panel.hidden=false; avatar.setAttribute("aria-expanded","true"); input.focus(); }
function closeChat() { panel.hidden=true; avatar.setAttribute("aria-expanded","false"); avatar.focus(); }
avatar.setAttribute("aria-expanded","false"); close.onclick=closeChat;
let active: AbortController | null = null;
stop.onclick = () => active?.abort();
form.onsubmit = async e => {
  e.preventDefault(); let message=input.value.trim(); if(!message || active)return; const shortcut=remoteSettings.quickCommands.find(c=>message==='/'+c.name);if(shortcut)message=shortcut.text;
  const target=conv(); target.messages.push({role:"user",content:message}); if(target.messages.length===1)target.title=message.slice(0,55);
  persist();renderList();paint();input.value="";try{localStorage.removeItem(DRAFT_KEY);}catch{}showSources([]);updateContext();
  const controller = new AbortController(); active=controller; avatar.classList.add("busy"); busyBadge.hidden=false; send.disabled=true;stop.hidden=false;status.textContent="Ожидание ответа…";
  try {
    const streaming=remoteSettings.streamEnabled&&!remoteSettings.toolsEnabled&&!/^запомни(?:\\s|:)/iu.test(message);const response=await fetch(streaming?"/api/chat/stream":"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,history:target.messages.slice(-Math.max(1,remoteSettings.historyLimit)),model:selectedModel||remoteSettings.model}),signal:controller.signal});
    if(!response.ok) { let err="Ошибка сервера: "+response.status; try { const body=await response.json() as {error?:string}; if(body.error)err=body.error; } catch {} throw new Error(err); }
    const type=response.headers.get("content-type")||"";
    if(type.includes("text/event-stream") || type.includes("application/x-ndjson") || type.includes("text/plain")) {
      if(!response.body)throw new Error("Сервер не поддерживает поток");
      const reply:Message={role:"assistant",content:""}; target.messages.push(reply);
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";let streamFailure="";let lastStreamSave=0;
      while(true) { const {done,value}=await reader.read(); if(done)break; buffer+=decoder.decode(value,{stream:true});
        if(type.includes("text/event-stream")) { const parts=buffer.split("\n\n");buffer=parts.pop()||"";for(const part of parts){for(const line of part.split("\n"))if(line.startsWith("data:")){const raw=line.slice(5).trim();if(raw==="[DONE]")continue;try{const obj=JSON.parse(raw) as {delta?:string;content?:string;error?:string;memories?:{id:string;content:string;source?:{source:string;confidence:string}}[]};if(obj.memories)showSources(obj.memories);if(obj.error){streamFailure=obj.error;continue;}reply.content+=obj.delta??obj.content??"";}catch{if(raw.startsWith("{"))streamFailure="Cloud.ru вернул некорректные данные потока";}}} }
        else if(type.includes("application/x-ndjson")) { const parts=buffer.split("\n");buffer=parts.pop()||"";for(const line of parts){try{const obj=JSON.parse(line) as {delta?:string};reply.content+=obj.delta||"";}catch{}} }
        else { reply.content+=buffer;buffer=""; }
        if(Date.now()-lastStreamSave>1000){persist();lastStreamSave=Date.now();}if(current===target.id)paint();
      }
      if(buffer && type.includes("text/plain"))reply.content+=buffer;
      if(!reply.content)target.messages.pop();if(streamFailure)throw Error(streamFailure);
    } else { const data=await response.json() as {reply?:string;error?:string;confirmation?:{id:string;name:string;input:string};memories?:{id:string;content:string;source?:{source:string;confidence:string}}[]};if(data.memories)showSources(data.memories);let steps=0;while(data.confirmation&&steps<3){
      const t=data.confirmation;const approved=confirm("Модель запрашивает инструмент «"+t.name+"» с аргументом «"+t.input+"». Разрешить?");
      const check=await fetch("/api/tools/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:t.id,approve:approved}),signal:controller.signal});
      const outcome=await check.json() as {reply?:string;error?:string;confirmation?:{id:string;name:string;input:string}};
      if(!check.ok)throw Error(outcome.error||"Ошибка инструмента");
      data.reply=outcome.reply;data.confirmation=outcome.confirmation;steps++;
    }
    if(data.confirmation)throw Error("Превышен лимит инструментов");
    if(typeof data.reply!=="string")throw new Error(data.error||"Нет ответа");target.messages.push({role:"assistant",content:data.reply}); }
    persist();if(current===target.id)paint();if(!status.textContent.startsWith("Поток ответа прерван"))status.textContent="";
  } catch(error) { status.textContent=error instanceof Error && error.name==="AbortError"?"Запрос остановлен":error instanceof Error?error.message:"Ошибка подключения";persist(); }
  finally {active=null;avatar.classList.remove("busy");busyBadge.hidden=true;send.disabled=false;stop.hidden=true;input.focus();}
};
input.addEventListener("input",()=>{updateContext();try{localStorage.setItem(DRAFT_KEY,input.value);}catch{}});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!panel.hidden)closeChat();});
let selectedModel="";
let models:string[] = selectedModel?[selectedModel]:[];
function renderModels() { const q=modelSearch.value.toLowerCase();modelSelect.replaceChildren();for(const name of models.filter(m=>m.toLowerCase().includes(q))){const opt=document.createElement("option");opt.value=name;opt.textContent=name;modelSelect.append(opt);} if(models.includes(selectedModel))modelSelect.value=selectedModel; }
modelSearch.oninput=renderModels;
modelSelect.onchange=async()=>{const previous=selectedModel;try{await saveRemote({model:modelSelect.value});selectedModel=modelSelect.value;try{localStorage.setItem(MODEL_KEY,selectedModel);}catch{}}catch(e){selectedModel=previous;renderModels();status.textContent="Не удалось выбрать модель: "+String(e);}};
renderModels();
async function refreshCloudModels(){const r=await fetch("/api/cloud/models");if(!r.ok)throw Error("Список моделей недоступен");const data=await r.json() as {models?:string[];available?:string[];manual?:string[];warning?:string};models=[...new Set([...(data.available||data.models||[]),...(data.manual||[]),selectedModel].filter(Boolean))];renderModels();return data;}
async function syncCloudSettings(){const r=await fetch("/api/settings");if(!r.ok)throw Error("Настройки Cloud.ru недоступны");remoteSettings=await r.json() as RemoteSettings;selectedModel=remoteSettings.model;models=[...new Set([selectedModel,...models].filter(Boolean))];renderModels();}
void syncCloudSettings().then(refreshCloudModels).catch(e=>{status.textContent=String(e);});
const FRAME_KEY="ayureika:chat:frame";
let full=false;
function frameSave(){if(full)return;try{localStorage.setItem(FRAME_KEY,JSON.stringify({left:panel.style.left,top:panel.style.top,width:panel.style.width,height:panel.style.height}));}catch{}}
try{const f=JSON.parse(localStorage.getItem(FRAME_KEY)||"null");if(f&&typeof f.left==="string"&&typeof f.top==="string"&&typeof f.width==="string"&&typeof f.height==="string"){panel.style.left=f.left;panel.style.top=f.top;panel.style.width=f.width;panel.style.height=f.height;panel.style.right="auto";panel.style.bottom="auto";}}catch{}
maximize.onclick=()=>{full=!full;panel.classList.toggle("maximized",full);maximize.textContent=full?"❐":"□";};
head.addEventListener("pointerdown",e=>{if(e.button!==0 || (e.target as HTMLElement).closest("button,input,select") || full || innerWidth<640)return;
 const rect=panel.getBoundingClientRect(),dx=e.clientX-rect.left,dy=e.clientY-rect.top;
 const move=(m:PointerEvent)=>{panel.style.left=Math.max(0,Math.min(innerWidth-panel.offsetWidth,m.clientX-dx))+"px";panel.style.top=Math.max(0,Math.min(innerHeight-panel.offsetHeight,m.clientY-dy))+"px";panel.style.right="auto";panel.style.bottom="auto";};
 const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);frameSave();};
 window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
});
const resize=document.createElement("div");resize.className="ay-resize";resize.title="Изменить размер чата";panel.append(resize);
resize.addEventListener("pointerdown",e=>{if(full||innerWidth<640)return;e.preventDefault();e.stopPropagation();const rect=panel.getBoundingClientRect(),sx=e.clientX,sy=e.clientY;
 const move=(m:PointerEvent)=>{panel.style.width=Math.max(420,Math.min(innerWidth-rect.left-8,rect.width+m.clientX-sx))+"px";panel.style.height=Math.max(300,Math.min(innerHeight-rect.top-8,rect.height+m.clientY-sy))+"px";};
 const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);frameSave();};
 window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
});

/* Settings layout adapted from JUUNIBI: navigation, search, collapsible cards and gold theme. */
const settingsOpen = button("⚙", "Настройки Ayureika");
head.insertBefore(settingsOpen, close);
const settingsPage = document.createElement("section");
settingsPage.className = "ay-settings-page"; settingsPage.hidden = true;
settingsPage.setAttribute("aria-label", "Настройки Ayureika");
const settingsHeader = document.createElement("header"); settingsHeader.className = "ay-settings-header";
const settingsHeading = document.createElement("div");
const settingsH1 = document.createElement("h1"); settingsH1.textContent = "Настройки";
const settingsHint = document.createElement("p"); settingsHint.textContent = "Все параметры в одном месте · изменения сохраняются";
settingsHeading.append(settingsH1,settingsHint);
const settingsExit = button("×", "Закрыть настройки");settingsExit.className="ay-settings-exit";
settingsHeader.append(settingsHeading,settingsExit);
const settingsLayout = document.createElement("div"); settingsLayout.className = "ay-settings-layout";
const settingsNav = document.createElement("aside"); settingsNav.className = "ay-settings-nav";
const settingsSearch = document.createElement("input"); settingsSearch.type = "search"; settingsSearch.placeholder = "Найти настройку…"; settingsSearch.setAttribute("aria-label","Поиск по настройкам");
const settingsLinks = document.createElement("nav"); settingsLinks.setAttribute("aria-label","Разделы настроек");
settingsNav.append(settingsSearch,settingsLinks);
const settingsContent = document.createElement("main"); settingsContent.className = "ay-settings-content";
const settingsEmpty=document.createElement("p");settingsEmpty.className="ay-settings-empty";settingsEmpty.textContent="Настройки не найдены. Попробуйте другой запрос.";settingsEmpty.hidden=true;
settingsLayout.append(settingsNav,settingsContent);settingsPage.append(settingsHeader,settingsLayout);document.body.append(settingsPage);
type SettingsSection = { id:string; title:string; icon:string; description:string; items:string[] };
const settingsSections:SettingsSection[] = [
  {id:"conn",title:"Подключение",icon:"☁",description:"Подключение Cloud.ru и состояние сервера.",items:["Cloud.ru API","Статус соединения"]},
  {id:"model",title:"Модель",icon:"✦",description:"Модели, доступные в чате.",items:["Основная модель","Поиск модели"]},
  {id:"persona",title:"Инструкции",icon:"✎",description:"Пожелания к ответам помощницы.",items:["Стиль ответов","Инструкции"]},
  {id:"memory",title:"Память",icon:"◈",description:"Запоминание, источники, связи, индексация и журнал.",items:["Запоминание","Источники","Связи","Индексация","Журнал","Проверка фактов"]},
  {id:"tools",title:"Инструменты",icon:"⚒",description:"Возможности и доступные инструменты.",items:["Инструменты помощницы"]},
  {id:"quick",title:"Быстрые команды",icon:"⌘",description:"Короткие команды в чате.",items:["Команды через /"]},
  {id:"look",title:"Внешний вид",icon:"◉",description:"Тема, цвет, шрифт и масштаб.",items:["Тема","Цвет","Шрифт","Скругление","Масштаб"]},
  {id:"avatar",title:"Аватар",icon:"狐",description:"Размер, прозрачность и изображение лисицы.",items:["Размер","Прозрачность","Загрузить изображение"]},
  {id:"chat",title:"Чат",icon:"▤",description:"Отображение сообщений и окна чата.",items:["Плотность сообщений","Размер текста","Окно чата"]},
  {id:"data",title:"Данные",icon:"▣",description:"История чатов и резервные копии.",items:["История чатов","Полная копия SQLite","Импорт","Экспорт"]},
  {id:"diagnostics",title:"Диагностика",icon:"✚",description:"Сервер, Cloud.ru и база SQLite.",items:["Проверка состояния","Ошибки подключения"]},
  {id:"about",title:"О программе",icon:"ⓘ",description:"Информация о проекте.",items:["Ayureika","GitHub"]}
];
const collapsedKey="ayureika:settings:collapsed:v1";
let collapsedIds:string[]=[];
try{const saved=JSON.parse(localStorage.getItem(collapsedKey)||"[]");if(Array.isArray(saved))collapsedIds=saved.filter((x:unknown)=>typeof x==="string");}catch{}
function settingsRow(label:string,detail:string):HTMLElement{
 const row=document.createElement("div");row.className="ay-settings-row";
 const text=document.createElement("strong");text.textContent=label;
 const hint=document.createElement("small");hint.textContent=detail;
 row.append(text,hint);return row;
}
const settingsCards=new Map<string,HTMLElement>();
let avatarControlsReady:HTMLElement|null=null;

type RemoteSettings={endpoint:string;model:string;fallbackModel:string;instructions:string;memoryEnabled:boolean;toolsEnabled:boolean;quickCommands:{name:string;text:string}[];embeddingModel:string;streamEnabled:boolean;historyLimit:number;allowedTools:string[];keyConfigured:boolean};
let remoteSettings:RemoteSettings={endpoint:"https://foundation-models.api.cloud.ru/v1",model:"",fallbackModel:"",instructions:"",memoryEnabled:true,toolsEnabled:false,quickCommands:[],embeddingModel:"",streamEnabled:true,historyLimit:20,allowedTools:["calculator","clock","memory_search"],keyConfigured:false};
const uiKey="ayureika:settings:ui:v1";
type UiPrefs={theme:string;accent:string;radius:string;scale:string;font:string;density:string};
let ui:UiPrefs={theme:"dark",accent:"#caa65b",radius:"16",scale:"100",font:"14",density:"normal"};
try{ui={...ui,...JSON.parse(localStorage.getItem(uiKey)||"{}")};}catch{}
function applyUi(){document.documentElement.style.setProperty("--ay-accent",ui.accent);document.documentElement.style.setProperty("--ay-radius",ui.radius+"px");document.documentElement.style.setProperty("--ay-scale",String(Number(ui.scale)/100));document.documentElement.style.setProperty("--ay-font",ui.font+"px");document.documentElement.style.setProperty("--ay-density",ui.density==="compact"?"8px":"14px");document.documentElement.dataset.ayTheme=ui.theme;try{localStorage.setItem(uiKey,JSON.stringify(ui));}catch{}}
applyUi();
async function saveRemote(patch:Partial<RemoteSettings>&{apiKey?:string;clearApiKey?:boolean}){
 const response=await fetch("/api/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});
 const data=await response.json() as RemoteSettings&{error?:string};if(!response.ok)throw Error(data.error||"Не удалось сохранить");
 remoteSettings=data;if(Object.prototype.hasOwnProperty.call(patch,"model")){selectedModel=data.model;models=[...new Set([data.model,...models].filter(Boolean))];renderModels();}return data;
}
function textField(label:string,value:string,onSave:(value:string)=>Promise<unknown>,secret=false){
 const wrap=document.createElement("label");wrap.className="ay-settings-field";
 const title=document.createElement("strong");title.textContent=label;
 const field=document.createElement("input");field.type=secret?"password":"text";field.value=value;field.autocomplete="off";
 const save=button("Сохранить");const note=document.createElement("small");note.setAttribute("role","status");
 save.onclick=async()=>{save.disabled=true;note.textContent="Сохранение…";try{await onSave(field.value);note.textContent="Сохранено";if(secret)field.value="";}catch(e){note.textContent=String(e);}finally{save.disabled=false;}};
 wrap.append(title,field,save,note);return wrap;
}
function choice(label:string,options:[string,string][],value:string,update:(v:string)=>void){
 const wrap=document.createElement("label");wrap.className="ay-settings-field";
 const title=document.createElement("strong");title.textContent=label;const select=document.createElement("select");
 for(const [v,t] of options){const o=document.createElement("option");o.value=v;o.textContent=t;select.append(o);}select.value=value;
 select.onchange=()=>update(select.value);wrap.append(title,select);return wrap;
}
function toggleSetting(label:string,value:boolean,change:(v:boolean)=>Promise<unknown>){
 const wrap=document.createElement("label");wrap.className="ay-settings-toggle";
 const check=document.createElement("input");check.type="checkbox";check.checked=value;
 const name=document.createElement("strong");name.textContent=label;const status=document.createElement("small");
 check.onchange=async()=>{check.disabled=true;try{await change(check.checked);status.textContent="Сохранено";}catch(e){check.checked=!check.checked;status.textContent=String(e);}finally{check.disabled=false;}};
 wrap.append(check,name,status);return wrap;
}
function downloadJson(data:unknown){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="ayureika-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function addSettingsCard(sec:SettingsSection){
 const card=document.createElement("section");card.className="ay-settings-card";card.id="ay-settings-"+sec.id;
 const top=button("",sec.title);top.className="ay-settings-card-head";
 const glyph=document.createElement("span");glyph.className="ay-settings-glyph";glyph.textContent=sec.icon;
 const heading=document.createElement("span");heading.className="ay-settings-card-title";
 const name=document.createElement("strong");name.textContent=sec.title;
 const description=document.createElement("small");description.textContent=sec.description;
 heading.append(name,description);
 const chevron=document.createElement("span");chevron.textContent="⌄";top.append(glyph,heading,chevron);
 const body=document.createElement("div");body.className="ay-settings-card-body";body.id="ay-settings-body-"+sec.id;top.setAttribute("aria-controls",body.id);
 const collapsed=collapsedIds.includes(sec.id);body.hidden=collapsed;card.classList.toggle("collapsed",collapsed);
 top.setAttribute("aria-expanded",String(!collapsed));
 top.onclick=()=>{const hide=!body.hidden;body.hidden=hide;card.classList.toggle("collapsed",hide);top.setAttribute("aria-expanded",String(!hide));
 collapsedIds=hide?[...new Set([...collapsedIds,sec.id])]:collapsedIds.filter(id=>id!==sec.id);
 try{localStorage.setItem(collapsedKey,JSON.stringify(collapsedIds));}catch{}};
 if(sec.id==="conn"){
  body.append(textField("Адрес Cloud.ru API (HTTPS, включая /v1)",remoteSettings.endpoint,v=>saveRemote({endpoint:v})));
  body.append(textField("API-ключ (сохраняется на локальном сервере)",remoteSettings.keyConfigured?"":"",v=>saveRemote({apiKey:v}),true));
  body.append(settingsRow("Состояние ключа",remoteSettings.keyConfigured?"Ключ настроен":"Ключ не задан"));
  const check=button("Проверить подключение");const status=document.createElement("small");status.setAttribute("role","status");
  check.onclick=async()=>{try{status.textContent="Проверка доступа к Cloud.ru…";const r=await fetch("/api/cloud/check");const h=await r.json() as {ok:boolean;error?:string;models?:number;modelAvailable?:boolean};status.textContent=h.ok?"Cloud.ru доступен · Моделей: "+h.models+(h.modelAvailable?"":" · Выбранная модель не найдена"):"Ошибка подключения: "+(h.error||"неизвестная ошибка");}catch(e){status.textContent=String(e);}};
  body.append(check,status);
  const test=button("Проверить ответ модели (расходует токены)");const testStatus=document.createElement("small");testStatus.setAttribute("role","status");
  test.onclick=async()=>{test.disabled=true;testStatus.textContent="Отправка тестового сообщения Cloud.ru…";try{const r=await fetch("/api/cloud/test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});const d=await r.json() as {ok:boolean;error?:string;reply?:string;model?:string};testStatus.textContent=d.ok?"Модель "+d.model+" ответила: "+d.reply:"Ошибка теста: "+(d.error||"неизвестная ошибка");}catch(e){testStatus.textContent=String(e);}finally{test.disabled=false;}};
  body.append(test,testStatus);
 }else if(sec.id==="model"){
  body.append(textField("Основная модель",remoteSettings.model,async v=>{await saveRemote({model:v});models=[...new Set([...models,v].filter(Boolean))];renderModels();}));
  body.append(textField("Запасная модель",remoteSettings.fallbackModel,v=>saveRemote({fallbackModel:v})));
  const capabilitiesButton=button("Проверить возможности по метаданным Cloud.ru");const capabilitiesOutput=document.createElement("div");capabilitiesOutput.className="ay-settings-capabilities";
  capabilitiesButton.onclick=async()=>{try{const r=await fetch("/api/cloud/models");if(!r.ok)throw Error("Список моделей недоступен");const d=await r.json() as {capabilities?:{id:string;streaming:boolean|null;tools:boolean|null;embeddings:boolean|null}[];warning?:string};const flags=(v:boolean|null)=>v===true?"Да":v===false?"Нет":"Не указано";capabilitiesOutput.replaceChildren(...(d.capabilities||[]).map(m=>settingsRow(m.id,"Поток: "+flags(m.streaming)+" · Инструменты: "+flags(m.tools)+" · Embeddings: "+flags(m.embeddings))));if(!d.capabilities?.length)capabilitiesOutput.textContent=d.warning||"Cloud.ru не предоставил метаданные возможностей. Неизвестное не означает отсутствие поддержки.";}catch(e){capabilitiesOutput.textContent=String(e);}};body.append(capabilitiesButton,capabilitiesOutput);
  const refresh=button("Получить список моделей");const list=document.createElement("div");list.className="ay-settings-model-list";
  refresh.onclick=async()=>{try{const r=await fetch("/api/cloud/models");const d=await refreshCloudModels();list.replaceChildren(...(d.warning?[settingsRow("Предупреждение",d.warning)]:[]),...((d.available||[]).map(m=>{const b=button("Cloud.ru · "+m);b.onclick=()=>{void saveRemote({model:m}).catch(e=>{list.textContent=String(e);});};return b;})),...((d.manual||[]).map(m=>{const b=button("Сохранённая вручную · "+m);b.onclick=()=>{void saveRemote({model:m}).catch(e=>{list.textContent=String(e);});};return b;})));}catch(e){list.textContent=String(e);}};
  body.append(refresh,list);
 }else if(sec.id==="persona"){
  const field=document.createElement("textarea");field.rows=6;field.value=remoteSettings.instructions;field.placeholder="Как должна отвечать Ayureika";
  const save=button("Сохранить инструкции");const status=document.createElement("small");save.onclick=()=>{void saveRemote({instructions:field.value}).then(()=>{status.textContent="Сохранено";}).catch(e=>{status.textContent=String(e);});};
  body.append(field,save,status);
 }else if(sec.id==="memory"){
  body.append(toggleSetting("Использовать память и историю как контекст",remoteSettings.memoryEnabled,v=>saveRemote({memoryEnabled:v})));
  body.append(textField("Модель Cloud.ru embeddings",remoteSettings.embeddingModel||"",v=>saveRemote({embeddingModel:v})));
  const candidateButton=button("Предложения для запоминания");const candidateOutput=document.createElement("div");candidateOutput.className="ay-settings-capabilities";candidateButton.onclick=async()=>{try{const r=await fetch("/api/memory/candidates");const d=await r.json() as {items:{id:number;content:string;source:string}[]};candidateOutput.replaceChildren(...d.items.map(item=>{const row=document.createElement("div");row.className="ay-settings-command";const label=document.createElement("span");label.textContent=item.content+" · "+item.source;const yes=button("Запомнить");const no=button("Отклонить");const decide=async(approve:boolean)=>{if(!confirm(approve?"Подтвердить сохранение факта?":"Отклонить предложение?"))return;await fetch("/api/memory/candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,approve,confirm:true})});candidateButton.click();};yes.onclick=()=>void decide(true);no.onclick=()=>void decide(false);row.append(label,yes,no);return row;}));if(!d.items.length)candidateOutput.textContent="Нет новых предложений";}catch(e){candidateOutput.textContent=String(e);}};body.append(candidateButton,candidateOutput);
  const journalButton=button("Журнал развития памяти");const journalOutput=document.createElement("pre");journalButton.onclick=async()=>{try{const r=await fetch("/api/memory/journal");const d=await r.json() as {items:{action:string;detail:string;created_at:string}[]};journalOutput.textContent=d.items.map(x=>x.created_at+" · "+x.action+" · "+x.detail).join("\\n")||"Журнал пуст";}catch(e){journalOutput.textContent=String(e);}};body.append(journalButton,journalOutput);
  const maintenanceButton=button("Обслужить память сейчас");const maintenanceOutput=document.createElement("small");maintenanceButton.onclick=async()=>{if(!confirm("Запустить локальное обслуживание SQLite?"))return;try{const r=await fetch("/api/memory/maintenance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});maintenanceOutput.textContent=JSON.stringify(await r.json());}catch(e){maintenanceOutput.textContent=String(e);}};body.append(maintenanceButton,maintenanceOutput);
  const review=button("Проверить похожие записи и противоречия");const reviewList=document.createElement("div");reviewList.className="ay-settings-model-list";
  review.onclick=async()=>{try{const r=await fetch("/api/memory/reviews");const d=await r.json() as {items:{id:number;kind:string;first_content:string;second_content:string}[]};reviewList.replaceChildren(...d.items.map(item=>{const row=document.createElement("div");row.className="ay-settings-command";const label=document.createElement("span");label.textContent=(item.kind==="similar"?"Похожие записи":"Возможное противоречие")+" · "+item.first_content+" / "+item.second_content;const dismiss=button("Проверено");dismiss.onclick=async()=>{if(!confirm("Пометить пару как проверенную, не изменяя факты?"))return;await fetch("/api/memory/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,status:"reviewed",confirm:true})});review.click();};row.append(label,dismiss);return row;}));if(!d.items.length)reviewList.textContent="Нет записей на проверку";}catch(e){reviewList.textContent=String(e);}};body.append(review,reviewList);
  const progress=button("Проверить фоновую индексацию");const progressText=document.createElement("small");progressText.setAttribute("role","status");
  progress.onclick=async()=>{try{const r=await fetch("/api/memory/monitor");if(!r.ok)throw Error("Монитор недоступен");const d=await r.json() as {enabled:boolean;busy:boolean;pending:number;processed:number;reviews:number;lastError:string;cloud:{latencyMs:number|null;lastSuccess:string|null;lastError:string;inputTokens:number;outputTokens:number}};progressText.textContent="Индексация: "+(d.enabled?(d.busy?"работает":"ожидает"):"не настроена")+" · В очереди: "+d.pending+" · Обработано после запуска: "+d.processed+" · На проверку: "+d.reviews+" · Cloud.ru: "+(d.cloud.latencyMs===null?"нет замера":d.cloud.latencyMs+" мс")+" · Токены: "+(d.cloud.inputTokens+d.cloud.outputTokens)+(d.lastError?" · Ошибка индексации: "+d.lastError:"")+(d.cloud.lastError?" · Ошибка Cloud.ru: "+d.cloud.lastError:"");}catch(e){progressText.textContent=String(e);}};body.append(progress,progressText);
  const reindex=button("Индексировать память");const indexing=document.createElement("small");
  reindex.onclick=async()=>{reindex.disabled=true;indexing.textContent="Индексация…";try{const r=await fetch("/api/memory/reindex",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});const d=await r.json() as {indexed?:number;remaining?:boolean;error?:string};indexing.textContent=r.ok?"Проиндексировано: "+d.indexed+(d.remaining?" · Есть ещё записи":" · Готово"):d.error||"Ошибка";}catch(e){indexing.textContent=String(e);}finally{reindex.disabled=false;}};
  body.append(reindex,indexing);
  const sourceId=document.createElement("input");sourceId.placeholder="ID факта для указания источника";const sourceName=document.createElement("input");sourceName.placeholder="Источник (документ, пользователь, ссылка)";const confidence=document.createElement("select");for(const [value,label] of [["unverified","Не проверено"],["user_confirmed","Подтверждено пользователем"],["source_checked","Источник проверен"]] as const){const o=document.createElement("option");o.value=value;o.textContent=label;confidence.append(o);}const saveSource=button("Сохранить источник факта");const sourceStatus=document.createElement("small");saveSource.onclick=async()=>{if(!confirm("Обновить источник и статус проверки факта?"))return;try{const r=await fetch("/api/memory/source",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:sourceId.value,source:sourceName.value,confidence:confidence.value,confirm:true})});const d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error||"Ошибка");sourceStatus.textContent="Источник сохранён";}catch(e){sourceStatus.textContent=String(e);}};body.append(sourceId,sourceName,confidence,saveSource,sourceStatus);
  const linkFrom=document.createElement("input");linkFrom.placeholder="ID первого воспоминания";const linkTo=document.createElement("input");linkTo.placeholder="ID второго воспоминания";const relation=document.createElement("select");for(const [value,label] of [["person","Человек"],["document","Документ"],["event","Событие"],["project","Проект"],["decision","Решение"],["related","Связано"]] as const){const o=document.createElement("option");o.value=value;o.textContent=label;relation.append(o);}const linkButton=button("Связать воспоминания");const linkStatus=document.createElement("small");linkButton.onclick=async()=>{if(!confirm("Создать связь между двумя фактами?"))return;try{const r=await fetch("/api/memory/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({from:linkFrom.value,to:linkTo.value,relation:relation.value,confirm:true})});const d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error||"Ошибка");linkStatus.textContent="Связь сохранена";}catch(e){linkStatus.textContent=String(e);}};body.append(linkFrom,linkTo,relation,linkButton,linkStatus);
  const editId=document.createElement("input");editId.placeholder="ID записи для исправления";const editContent=document.createElement("textarea");editContent.placeholder="Новый текст факта";const editButton=button("Исправить факт с сохранением версии");const editResult=document.createElement("small");editButton.onclick=async()=>{if(!confirm("Изменить факт и сохранить предыдущую версию?"))return;try{const r=await fetch("/api/memory/revise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editId.value,content:editContent.value,confirm:true})});const d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error||"Не удалось изменить");editResult.textContent="Факт обновлён, предыдущая версия сохранена";}catch(e){editResult.textContent=String(e);}};body.append(editId,editContent,editButton,editResult);
  const versionsInput=document.createElement("input");versionsInput.placeholder="ID записи для просмотра версий";const versionsButton=button("История изменений");const versionsOutput=document.createElement("pre");versionsButton.onclick=async()=>{try{const r=await fetch("/api/memory/versions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:versionsInput.value})});const d=await r.json() as {items?:{created_at:string;action:string;content:string}[];error?:string};versionsOutput.textContent=d.items?.map(x=>x.created_at+" · "+x.action+" · "+x.content).join("\n")||d.error||"История пуста";}catch(e){versionsOutput.textContent=String(e);}};body.append(versionsInput,versionsButton,versionsOutput);
  const note=document.createElement("small");note.textContent="SQLite: защита от дубликатов, смысловой поиск через embeddings при заданной модели; без неё поиск по словам.";
  const input=document.createElement("textarea");input.rows=3;input.placeholder="Запись, которую Ayureika должна помнить";
  const save=button("Запомнить");const searchInput=document.createElement("input");searchInput.placeholder="Поиск по памяти";
  const searchButton=button("Найти");const list=document.createElement("div");list.className="ay-settings-model-list";const status=document.createElement("small");
  const request=async(path:string,data:unknown)=>{const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const v=await r.json() as {error?:string;items?:{id:string;content:string}[]};if(!r.ok)throw Error(v.error||"Ошибка памяти");return v;};
  const render=async(items?:{id:string;content:string}[])=>{try{const rows=items||(await (await fetch("/api/memory")).json() as {items:{id:string;content:string}[]}).items;list.replaceChildren(...rows.map(item=>{const row=document.createElement("div");row.className="ay-settings-command";const label=document.createElement("span");label.textContent=item.content;const del=button("Удалить");del.onclick=async()=>{if(!confirm("Удалить эту запись памяти?"))return;try{await request("/api/memory/delete",{id:item.id,confirm:true});await render();}catch(e){status.textContent=String(e);}};row.append(label,del);return row;}));}catch(e){status.textContent=String(e);}};
  save.onclick=async()=>{try{await request("/api/memory",{content:input.value});input.value="";await render();status.textContent="Сохранено";}catch(e){status.textContent=String(e);}};
  searchButton.onclick=async()=>{try{const data=await request("/api/memory/search",{query:searchInput.value});await render(data.items||[]);}catch(e){status.textContent=String(e);}};
  const all=button("Показать все записи");all.onclick=()=>{void render();};
  body.append(note,input,save,searchInput,searchButton,all,list,status);void render();
 }else if(sec.id==="tools"){
  body.append(toggleSetting("Разрешить инструменты",remoteSettings.toolsEnabled,v=>saveRemote({toolsEnabled:v})));
  const permissionLabel=document.createElement("strong");permissionLabel.textContent="Разрешения по инструментам";body.append(permissionLabel);for(const [id,label] of [["calculator","Калькулятор"],["clock","Часы UTC"],["memory_search","Поиск памяти"]])body.append(toggleSetting(label,remoteSettings.allowedTools.includes(id),async enabled=>{const next=enabled?[...new Set([...remoteSettings.allowedTools,id])]:remoteSettings.allowedTools.filter(x=>x!==id);await saveRemote({allowedTools:next});}));
  body.append(settingsRow("Безопасные инструменты","Калькулятор, часы и поиск в памяти. Модель может запросить инструмент в чате, но запуск происходит только после подтверждения."));
  const select=document.createElement("select");for(const [v,label] of [["calculator","Калькулятор"],["clock","Текущее время UTC"],["memory_search","Поиск в памяти"]]){const opt=document.createElement("option");opt.value=v;opt.textContent=label;select.append(opt);}
  const input=document.createElement("input");input.placeholder="Выражение или поисковый запрос";const run=button("Выполнить");const result=document.createElement("pre");const audit=button("Журнал операций");
  run.onclick=async()=>{if(!confirm("Разрешить выполнение инструмента «"+select.value+"»?"))return;try{const r=await fetch("/api/tools/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:select.value,input:input.value,confirm:true})});const d=await r.json() as {output?:string;error?:string};result.textContent=d.output||d.error||"Нет ответа";}catch(e){result.textContent=String(e);}};
  audit.onclick=async()=>{try{const r=await fetch("/api/tools");const d=await r.json() as {audit:{name:string;created_at:string;output:string}[]};result.textContent=d.audit.map(x=>x.created_at+" "+x.name+": "+x.output).join("\\n")||"Журнал пуст";}catch(e){result.textContent=String(e);}};
  body.append(select,input,run,audit,result);
 }else if(sec.id==="quick"){
  const list=document.createElement("div");const render=()=>{list.replaceChildren(...remoteSettings.quickCommands.map((c,i)=>{const row=document.createElement("div");row.className="ay-settings-command";const name=document.createElement("span");name.textContent="/"+c.name+" — "+c.text.slice(0,70);const del=button("Удалить");del.onclick=()=>{void saveRemote({quickCommands:remoteSettings.quickCommands.filter((_,j)=>j!==i)}).then(render);};row.append(name,del);return row;}));};
  const name=document.createElement("input");name.placeholder="Имя команды";const value=document.createElement("textarea");value.placeholder="Текст команды";value.rows=2;
  const add=button("Добавить команду");const status=document.createElement("small");
  add.onclick=()=>{const n=name.value.trim().replace(/^\//,"");if(!/^[a-zA-Zа-яА-ЯёЁ0-9_-]{1,32}$/.test(n)||!value.value.trim()){status.textContent="Укажите имя и текст";return;}void saveRemote({quickCommands:[...remoteSettings.quickCommands,{name:n,text:value.value.trim()}]}).then(()=>{name.value="";value.value="";render();status.textContent="Сохранено";}).catch(e=>{status.textContent=String(e);});};
  body.append(settingsRow("Быстрые команды","Введите /имя в чат, чтобы подставить текст"),list,name,value,add,status);render();
 }else if(sec.id==="look"){
  body.append(choice("Тема",[["dark","Тёмная"],["light","Светлая"],["auto","Как в системе"]],ui.theme,v=>{ui.theme=v;applyUi();}));
  const accents=document.createElement("div");accents.className="ay-settings-swatches";
  for(const color of ["#caa65b","#6788bd","#9572bc","#579b82","#b76d6d"]){const dot=button("","Цвет "+color);dot.style.background=color;dot.className="ay-settings-color";dot.onclick=()=>{ui.accent=color;applyUi();};accents.append(dot);}
  body.append(settingsRow("Цвет оформления","Выберите цвет акцента"),accents);
  body.append(choice("Шрифт",[["12","Компактный"],["14","Стандартный"],["17","Крупный"]],ui.font,v=>{ui.font=v;applyUi();}));
  body.append(choice("Скругление",[["4","Строгое"],["16","Обычное"],["26","Круглое"]],ui.radius,v=>{ui.radius=v;applyUi();}));
  body.append(choice("Масштаб",[["85","85%"],["100","100%"],["115","115%"]],ui.scale,v=>{ui.scale=v;applyUi();}));
 }else if(sec.id==="avatar"){
  body.append(settingsRow("Аватар","Размер, прозрачность и изображение доступны в этом разделе."));
 }else if(sec.id==="chat"){
  body.append(toggleSetting("Потоковые ответы (при отключённых инструментах)",remoteSettings.streamEnabled,v=>saveRemote({streamEnabled:v})));
  body.append(choice("Контекст истории",[["0","Без истории"],["5","5 сообщений"],["10","10 сообщений"],["20","20 сообщений"]],String(remoteSettings.historyLimit),v=>saveRemote({historyLimit:Number(v)})));

  body.append(choice("Плотность сообщений",[["compact","Компактная"],["normal","Обычная"]],ui.density,v=>{ui.density=v;applyUi();}));
  const reset=button("Сбросить положение окна");reset.onclick=()=>{try{localStorage.removeItem(FRAME_KEY);}catch{}panel.style.left="";panel.style.top="";panel.style.width="";panel.style.height="";panel.style.right="";panel.style.bottom="";};body.append(reset);
 }else if(sec.id==="data"){
  const backup=button("Экспорт чатов и оформления");backup.onclick=()=>downloadJson({kind:"ayureika-backup",version:1,chats,ui,commands:remoteSettings.quickCommands,instructions:remoteSettings.instructions});
  const file=document.createElement("input");file.type="file";file.accept="application/json,.json";const status=document.createElement("small");
  file.onchange=async()=>{const f=file.files?.[0];if(!f)return;try{if(f.size>5e6)throw Error("Файл слишком большой");const d=JSON.parse(await f.text()) as {kind?:string;version?:number;chats?:Conversation[];ui?:Partial<UiPrefs>;commands?:RemoteSettings["quickCommands"];instructions?:string};
   if(d.kind!=="ayureika-backup"||d.version!==1||!Array.isArray(d.chats))throw Error("Неподходящий формат");
   if(!confirm("Восстановить резервную копию? Текущие чаты будут заменены."))return;
   chats=d.chats.filter(c=>c&&typeof c.id==="string"&&typeof c.title==="string"&&Array.isArray(c.messages)).slice(0,100);if(!chats.length)chats=[makeChat()];current=chats[0]!.id;persist();renderList();paint();
   if(d.ui){ui={...ui,...d.ui};applyUi();}if(Array.isArray(d.commands))await saveRemote({quickCommands:d.commands});if(typeof d.instructions==="string")await saveRemote({instructions:d.instructions});status.textContent="Восстановлено";
  }catch(e){status.textContent=String(e);}};
  const clear=button("Удалить всю историю чатов");clear.onclick=()=>{if(!confirm("Безвозвратно удалить все переписки?"))return;chats=[makeChat()];current=chats[0]!.id;persist();renderList();paint();};
  const fullBackup=button("Экспорт полной памяти SQLite");fullBackup.onclick=async()=>{try{const r=await fetch("/api/data/full-export");if(!r.ok)throw Error("Не удалось экспортировать SQLite");downloadJson(await r.json());status.textContent="Полная копия создана. API-ключ не экспортируется.";}catch(e){status.textContent=String(e);}};
  const fullFile=document.createElement("input");fullFile.type="file";fullFile.accept=".json,application/json";
  const fullRestore=button("Импорт полной памяти SQLite");fullRestore.onclick=async()=>{const f=fullFile.files?.[0];if(!f)return;try{if(f.size>25e6)throw Error("Размер копии превышает 25 МБ");const data=JSON.parse(await f.text()) as {kind?:string;version?:number};if(data.kind!=="ayureika-sqlite-backup"||data.version!==2)throw Error("Неверный формат полной копии");if(!confirm("Добавить данные из полной копии SQLite? Существующие записи сохраняются."))return;const r=await fetch("/api/data/full-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...data,confirm:true})});const d=await r.json() as {imported?:number;error?:string};if(!r.ok)throw Error(d.error||"Ошибка восстановления");status.textContent="Восстановление завершено. Записей в копии: "+d.imported;}catch(e){status.textContent=String(e);}};body.append(fullBackup,fullFile,fullRestore);
  const memoryBackup=button("Экспорт совместимости (до 100 фактов)");memoryBackup.onclick=async()=>{try{const r=await fetch("/api/data/export");if(!r.ok)throw Error("Не удалось получить данные сервера");downloadJson(await r.json());}catch(e){status.textContent=String(e);}};
  const memoryFile=document.createElement("input");memoryFile.type="file";memoryFile.accept=".json,application/json";const importMemory=button("Восстановить память из файла");importMemory.onclick=async()=>{const f=memoryFile.files?.[0];if(!f)return;try{if(f.size>1e6)throw Error("Файл слишком большой");const data=JSON.parse(await f.text()) as {kind?:string;version?:number;facts?:string[]};if(data.kind!=="ayureika-server-backup"||data.version!==1||!Array.isArray(data.facts))throw Error("Неверный формат");if(!confirm("Добавить записи памяти из резервной копии?"))return;const r=await fetch("/api/data/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...data,confirm:true})});const result=await r.json() as {imported?:number;error?:string};if(!r.ok)throw Error(result.error||"Ошибка");status.textContent="Импортировано записей: "+result.imported+" · Настройки восстановлены (API-ключ не менялся)";}catch(e){status.textContent=String(e);}};
  body.append(memoryBackup,memoryFile,importMemory);
  body.append(backup,settingsRow("Импорт резервной копии","Выберите ранее сохранённый файл Ayureika"),file,status,clear);
 }else if(sec.id==="diagnostics"){
  const check=button("Проверить компоненты");const out=document.createElement("pre");check.onclick=async()=>{out.textContent="Проверка…";try{const [local,cloud]=await Promise.all([fetch("/api/diagnostics").then(r=>r.json()),fetch("/api/cloud/check").then(r=>r.json())]);out.textContent="Сервер: "+local.server+"\nSQLite: "+local.sqlite+"\nЗаписей памяти: "+local.memory.count+"\nCloud.ru: "+(cloud.ok?"доступен":cloud.error||"нет соединения")+"\nПоток: "+(local.streamEnabled?"включён":"выключен")+"\nОчередь индексации: "+local.indexing.pending+"\nОбработано: "+local.indexing.processed+"\nЗадержка Cloud.ru: "+(local.cloud.latencyMs??"нет замера")+" мс";}catch(e){out.textContent=String(e);}};body.append(check,out);
 }else if(sec.id==="about"){
  body.append(settingsRow("Проект","Ayureika · интерфейс TypeScript, сервер Node.js"));
  const link=document.createElement("a");link.href="https://github.com/Aspksa/Ayureika";link.target="_blank";link.rel="noopener noreferrer";link.textContent="Открыть репозиторий GitHub";
  body.append(link,settingsRow("Горячие клавиши","Ctrl+, — настройки · Escape — закрыть"));
 }
 card.append(top,body);settingsContent.append(card);settingsCards.set(sec.id,card);
 const nav=button(sec.icon+"  "+sec.title);nav.className="ay-settings-link";nav.dataset.section=sec.id;nav.title=sec.title;nav.setAttribute("aria-label",sec.title);const navGlyph=document.createElement("span");navGlyph.className="ay-settings-link-glyph";navGlyph.textContent=sec.icon;const label=document.createElement("span");label.className="ay-settings-link-label";label.textContent=sec.title;nav.replaceChildren(navGlyph,label);
 nav.onclick=()=>selectSettingsSection(sec.id);

 settingsLinks.append(nav);
}
const SETTINGS_ACTIVE_KEY="ayureika:settings:active:v2";let activeSettingsSection=(()=>{try{const id=localStorage.getItem(SETTINGS_ACTIVE_KEY)||"conn";return settingsSections.some(x=>x.id===id)?id:"conn";}catch{return "conn";}})();
function selectSettingsSection(id:string){
 activeSettingsSection=id;try{localStorage.setItem(SETTINGS_ACTIVE_KEY,id);}catch{}
 settingsEmpty.hidden=true;
 for(const section of settingsSections){
  const card=settingsCards.get(section.id);
  if(card)card.hidden=section.id!==id;
  const nav=settingsLinks.querySelector<HTMLButtonElement>('[data-section="'+section.id+'"]');
  if(nav){nav.classList.toggle("active",section.id===id);nav.setAttribute("aria-current",section.id===id?"page":"false");}
 }
 const selected=settingsCards.get(id);
 if(selected){const body=selected.querySelector<HTMLElement>(".ay-settings-card-body");const top=selected.querySelector<HTMLButtonElement>(".ay-settings-card-head");if(body?.hidden)top?.click();}
 settingsContent.scrollTop=0;
}
function rebuildSettings(){
 settingsContent.replaceChildren();settingsLinks.replaceChildren();settingsCards.clear();
 for(const section of settingsSections)addSettingsCard(section);
 if(typeof avatarControlsReady!=="undefined"&&avatarControlsReady){settingsCards.get("avatar")?.querySelector(".ay-settings-card-body")?.append(avatarControlsReady);}
 selectSettingsSection(activeSettingsSection);
 settingsContent.append(settingsEmpty);
}
rebuildSettings();
settingsSearch.oninput=()=>{
 const q=settingsSearch.value.toLocaleLowerCase("ru").replace(/ё/g,"е").trim();
 const matches=settingsSections.filter(sec=>{
  const card=settingsCards.get(sec.id);
  return (sec.title+" "+sec.description+" "+sec.items.join(" ")+" "+(card?.textContent||"")).toLocaleLowerCase("ru").replace(/ё/g,"е").includes(q);
 });
 for(const sec of settingsSections){
  const nav=settingsLinks.querySelector<HTMLButtonElement>('[data-section="'+sec.id+'"]');
  if(nav)nav.hidden=!matches.some(x=>x.id===sec.id);
 }
 if(matches.length)selectSettingsSection(matches.some(x=>x.id===activeSettingsSection)?activeSettingsSection:matches[0]!.id);
 if(!matches.length){for(const card of settingsCards.values())card.hidden=true;settingsEmpty.hidden=false;}else settingsEmpty.hidden=true;
};
async function showSettings(){try{const r=await fetch('/api/settings');if(r.ok){remoteSettings=await r.json() as RemoteSettings;selectedModel=remoteSettings.model;models=[...new Set([selectedModel,...models].filter(Boolean))];renderModels();rebuildSettings();settingsSearch.dispatchEvent(new Event("input"));}}catch{}settingsPage.hidden=false;panel.hidden=true;settingsSearch.focus();}
function hideSettings(){settingsPage.hidden=true;settingsSearch.value="";settingsSearch.dispatchEvent(new Event("input"));}
settingsOpen.onclick=showSettings;settingsExit.onclick=hideSettings;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!settingsPage.hidden)hideSettings();if(e.ctrlKey&&e.key===","){e.preventDefault();showSettings();}});

renderList();paint();
let pos: { x: number; y: number } = { x: 1, y: 1 };
try { const p = JSON.parse(localStorage.getItem(POS) || "null"); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pos = { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) }; } catch { /* no saved position */ }
const margin = 16;
type AvatarPrefs = { size: number; opacity: number };
const prefs: AvatarPrefs = { size: 64, opacity: 100 };
try {
  const saved = JSON.parse(localStorage.getItem(PREFS) || "null");
  if (saved && Number.isFinite(saved.size) && Number.isFinite(saved.opacity)) {
    prefs.size = Math.max(40, Math.min(160, saved.size));
    prefs.opacity = Math.max(30, Math.min(100, saved.opacity));
  }
} catch { /* storage disabled */ }
function applyPrefs() {
  avatar.style.setProperty("--avatar-size", prefs.size + "px");
  avatar.style.opacity = String(prefs.opacity / 100);
}
applyPrefs();
const settings = document.createElement("div");
settings.className = "ay-avatar-controls";
settings.setAttribute("aria-label", "Настройки аватара");
const settingsTitle = document.createElement("strong"); settingsTitle.textContent = "Настройки аватара";
const settingsHead = document.createElement("header"); settingsHead.append(settingsTitle);
function setting(labelText: string, min: number, max: number, value: number, update: (v: number) => void) {
  const label = document.createElement("label");
  const name = document.createElement("span"); name.textContent = labelText;
  const current = document.createElement("output"); current.textContent = String(value);
  const range = document.createElement("input"); range.type = "range"; range.min = String(min); range.max = String(max); range.value = String(value);
  range.addEventListener("input", () => { const v = Number(range.value); current.textContent = String(v); update(v); applyPrefs(); place(); try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} });
  label.append(name, current, range); settings.append(label);
}
settings.append(settingsHead);
setting("Размер, пиксели", 40, 160, prefs.size, v => { prefs.size = v; });
setting("Прозрачность, %", 30, 100, prefs.opacity, v => { prefs.opacity = v; });
const uploadLabel = document.createElement("label");
uploadLabel.className = "ay-avatar-upload";
uploadLabel.textContent = "Загрузить изображение";
const upload = document.createElement("input");
upload.type = "file"; upload.accept = "image/png,image/jpeg,image/webp";
upload.setAttribute("aria-label", "Загрузить аватар PNG, JPG или WebP");
uploadLabel.append(upload); settings.append(uploadLabel);
const uploadStatus = document.createElement("p");
uploadStatus.className = "ay-avatar-upload-status"; uploadStatus.setAttribute("role", "status");
settings.append(uploadStatus);
upload.addEventListener("change", async () => {
  const file = upload.files?.[0]; if (!file) return;
  upload.value = "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { uploadStatus.textContent = "Выберите PNG, JPG или WebP."; return; }
  if (file.size > 2 * 1024 * 1024) { uploadStatus.textContent = "Файл слишком большой. Максимум 2 МБ."; return; }
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Не удалось прочитать файл"));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
    await new Promise<void>((resolve, reject) => {
      const check = new Image();
      check.onload = () => resolve();
      check.onerror = () => reject(new Error("Файл не является корректным изображением"));
      check.src = dataUrl;
    });
    localStorage.setItem(AVATAR_IMAGE, dataUrl);
    img.hidden = false; img.src = dataUrl;
    uploadStatus.textContent = "Аватар сохранён в этом браузере.";
  } catch (error) { uploadStatus.textContent = error instanceof Error ? error.message : "Не удалось сохранить изображение"; }
});
avatarControlsReady=settings;
const avatarSettingsCard=settingsCards.get("avatar");const avatarSettingsBody=avatarSettingsCard?.querySelector(".ay-settings-card-body");avatarSettingsBody?.append(settings);
avatar.addEventListener("contextmenu", e => { e.preventDefault();selectSettingsSection("avatar");void showSettings(); });
avatar.addEventListener("keydown", e => { if (e.key === "F10" && e.shiftKey) { e.preventDefault();selectSettingsSection("avatar");void showSettings(); } });

function place() { const w = Math.max(0, innerWidth - prefs.size - margin * 2), h = Math.max(0, innerHeight - prefs.size - margin * 2); avatar.style.left = margin + pos.x * w + "px"; avatar.style.top = margin + pos.y * h + "px"; }
place(); window.addEventListener("resize", place);
avatar.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  const r = avatar.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
  let moved = false;
  avatar.setPointerCapture(e.pointerId);
  const move = (m: PointerEvent) => {
    if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return;
    moved = true; avatar.classList.add("dragging"); const w = Math.max(1, innerWidth - prefs.size - margin * 2), h = Math.max(1, innerHeight - prefs.size - margin * 2);
    pos = { x: Math.max(0, Math.min(1, (m.clientX - dx - margin) / w)), y: Math.max(0, Math.min(1, (m.clientY - dy - margin) / h)) }; place();
  };
  const up = () => { avatar.removeEventListener("pointermove", move); avatar.removeEventListener("pointerup", up); avatar.removeEventListener("pointercancel", up); avatar.classList.remove("dragging"); if (moved) { avatar.dataset.dragged = "yes"; try { localStorage.setItem(POS, JSON.stringify(pos)); } catch {} } };
  avatar.addEventListener("pointermove", move); avatar.addEventListener("pointerup", up); avatar.addEventListener("pointercancel", up);
});
avatar.addEventListener("click", () => { if (avatar.dataset.dragged) { delete avatar.dataset.dragged; return; } openChat(); });



})();
