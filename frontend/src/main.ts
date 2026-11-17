(() => {
type Message = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; messages: Message[] };
const KEY = "ayureika:chat:v2", OLD_KEY = "ayureika:chat:v1", POS = "ayureika:avatar:position", PREFS = "ayureika:avatar:preferences", AVATAR_IMAGE = "ayureika:avatar:image:v1";
const CHAT_RECT = "ayureika:chat:rect", MODEL_KEY = "ayureika:chat:model";
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
function persist() { try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0,100))); } catch { status.textContent = "Не удалось сохранить историю"; } }
function button(text: string, title = text) { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.title = title; return b; }
const avatar = button("", "Открыть чат · перетащите для перемещения");
avatar.className = "ay-avatar"; avatar.setAttribute("aria-label","Открыть чат Ayureika");
const img = document.createElement("img"); img.src = "/assets/avatar.png"; img.alt = ""; img.draggable = false;
const fallback = document.createElement("span"); fallback.className = "ay-fallback"; fallback.textContent = "А";
img.onload = () => { fallback.hidden = true; img.hidden = false; };
img.onerror = () => { fallback.hidden = false; img.hidden = true; };
try { const savedImage = localStorage.getItem(AVATAR_IMAGE); if (savedImage && /^data:image\\/(png|jpeg|webp);base64,/.test(savedImage)) img.src = savedImage; } catch {}
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
const stop = button("Стоп"); stop.hidden = true;
const status = document.createElement("p"); status.className = "ay-status"; status.setAttribute("role","status");
form.append(input,send,stop); main.append(head,thread,form,status); panel.append(side,main); document.body.append(avatar,panel);
function updateContext() {
  const chars = conv().messages.slice(-20).reduce((n,m)=>n+m.content.length,0)+input.value.length;
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
  e.preventDefault(); const message=input.value.trim(); if(!message || active)return;
  const target=conv(); target.messages.push({role:"user",content:message}); if(target.messages.length===1)target.title=message.slice(0,55);
  persist();renderList();paint();input.value="";updateContext();
  const controller = new AbortController(); active=controller; avatar.classList.add("busy"); busyBadge.hidden=false; send.disabled=true;stop.hidden=false;status.textContent="Ожидание ответа…";
  try {
    const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,history:target.messages.slice(-20),model:modelSelect.value}),signal:controller.signal});
    if(!response.ok) { let err="Ошибка сервера: "+response.status; try { const body=await response.json() as {error?:string}; if(body.error)err=body.error; } catch {} throw new Error(err); }
    const type=response.headers.get("content-type")||"";
    if(type.includes("text/event-stream") || type.includes("application/x-ndjson") || type.includes("text/plain")) {
      if(!response.body)throw new Error("Сервер не поддерживает поток");
      const reply:Message={role:"assistant",content:""}; target.messages.push(reply);
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
      while(true) { const {done,value}=await reader.read(); if(done)break; buffer+=decoder.decode(value,{stream:true});
        if(type.includes("text/event-stream")) { const parts=buffer.split("\n\n");buffer=parts.pop()||"";for(const part of parts){for(const line of part.split("\n"))if(line.startsWith("data:")){const raw=line.slice(5).trim();if(raw==="[DONE]")continue;try{const obj=JSON.parse(raw) as {delta?:string;content?:string};reply.content+=obj.delta??obj.content??"";}catch{reply.content+=raw;}}} }
        else if(type.includes("application/x-ndjson")) { const parts=buffer.split("\n");buffer=parts.pop()||"";for(const line of parts){try{const obj=JSON.parse(line) as {delta?:string};reply.content+=obj.delta||"";}catch{}} }
        else { reply.content+=buffer;buffer=""; }
        if(current===target.id)paint();
      }
      if(buffer && type.includes("text/plain"))reply.content+=buffer;
      if(!reply.content)target.messages.pop();
    } else { const data=await response.json() as {reply?:string;error?:string};if(typeof data.reply!=="string")throw new Error(data.error||"Нет ответа");target.messages.push({role:"assistant",content:data.reply}); }
    persist();if(current===target.id)paint();status.textContent="";
  } catch(error) { status.textContent=error instanceof Error && error.name==="AbortError"?"Запрос остановлен":error instanceof Error?error.message:"Ошибка подключения";persist(); }
  finally {active=null;avatar.classList.remove("busy");busyBadge.hidden=true;send.disabled=false;stop.hidden=true;input.focus();}
};
input.addEventListener("input",updateContext);
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!panel.hidden)closeChat();});
const selectedModel=localStorage.getItem(MODEL_KEY)||"";
let models:string[] = selectedModel?[selectedModel]:[];
function renderModels() { const q=modelSearch.value.toLowerCase();modelSelect.replaceChildren();for(const name of models.filter(m=>m.toLowerCase().includes(q))){const opt=document.createElement("option");opt.value=name;opt.textContent=name;modelSelect.append(opt);} if(models.includes(selectedModel))modelSelect.value=selectedModel; }
modelSearch.oninput=renderModels;
modelSelect.onchange=()=>{try{localStorage.setItem(MODEL_KEY,modelSelect.value);}catch{}};
renderModels();
fetch("/api/cloud/models").then(async r=>{if(!r.ok)return;const data=await r.json() as {models?:string[]};if(Array.isArray(data.models)){models=[...new Set([...models,...data.models.filter(m=>typeof m==="string")])];renderModels();}}).catch(()=>{});
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
const settings = document.createElement("section");
settings.className = "ay-avatar-settings"; settings.hidden = true;
settings.setAttribute("aria-label", "Настройки аватара");
const settingsTitle = document.createElement("strong"); settingsTitle.textContent = "Настройки аватара";
const settingsClose = document.createElement("button"); settingsClose.type = "button"; settingsClose.textContent = "×"; settingsClose.title = "Закрыть настройки";
settingsClose.onclick = () => { settings.hidden = true; avatar.focus(); };
const settingsHead = document.createElement("header"); settingsHead.append(settingsTitle, settingsClose);
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
document.body.append(settings);
avatar.addEventListener("contextmenu", e => { e.preventDefault(); settings.hidden = !settings.hidden; if (!settings.hidden) settingsClose.focus(); });
avatar.addEventListener("keydown", e => { if (e.key === "F10" && e.shiftKey) { e.preventDefault(); settings.hidden = !settings.hidden; } });

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
