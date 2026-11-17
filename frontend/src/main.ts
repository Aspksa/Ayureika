// Ayureika: avatar and chat adapted from JUUNIBI, without its unrelated modules.
type Message = { role: "user" | "assistant"; content: string };
const KEY = "ayureika:chat:v1";
const POS = "ayureika:avatar:position";
const history: Message[] = (() => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((m: Message) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-100) : []; } catch { return []; } })();
const avatar = document.createElement("button");
avatar.className = "ay-avatar"; avatar.type = "button"; avatar.title = "Открыть чат · перетащите для перемещения"; avatar.setAttribute("aria-label", "Открыть чат Ayureika");
const img = document.createElement("img"); img.src = "/assets/avatar.png"; img.alt = ""; img.draggable = false;
const fallback = document.createElement("span"); fallback.textContent = "А"; fallback.className = "ay-fallback";
img.onload = () => fallback.remove(); img.onerror = () => img.remove();
avatar.append(fallback, img);
const panel = document.createElement("section"); panel.className = "ay-chat"; panel.hidden = true; panel.setAttribute("aria-label", "Чат Ayureika");
const head = document.createElement("header"); head.className = "ay-head";
const title = document.createElement("strong"); title.textContent = "Ayureika";
const clear = document.createElement("button"); clear.type = "button"; clear.textContent = "Новый чат"; clear.title = "Очистить историю";
const close = document.createElement("button"); close.type = "button"; close.textContent = "×"; close.title = "Закрыть чат";
head.append(title, clear, close);
const thread = document.createElement("div"); thread.className = "ay-thread"; thread.setAttribute("role", "log"); thread.setAttribute("aria-live", "polite");
const form = document.createElement("form"); form.className = "ay-form";
const input = document.createElement("textarea"); input.rows = 2; input.placeholder = "Сообщение…"; input.setAttribute("aria-label", "Сообщение");
const send = document.createElement("button"); send.type = "submit"; send.textContent = "Отправить";
const stop = document.createElement("button"); stop.type = "button"; stop.textContent = "Стоп"; stop.hidden = true;
const status = document.createElement("p"); status.className = "ay-status"; status.setAttribute("role", "status");
form.append(input, send, stop); panel.append(head, thread, form, status); document.body.append(avatar, panel);
function save() { try { localStorage.setItem(KEY, JSON.stringify(history.slice(-100))); } catch { /* private browsing */ } }
function paint() {
  thread.replaceChildren();
  for (const m of history) { const item = document.createElement("div"); item.className = "ay-msg " + m.role; item.textContent = m.content; thread.append(item); }
  thread.scrollTop = thread.scrollHeight;
}
paint();
function openChat() { panel.hidden = false; avatar.setAttribute("aria-expanded", "true"); input.focus(); }
function closeChat() { panel.hidden = true; avatar.setAttribute("aria-expanded", "false"); avatar.focus(); }
avatar.setAttribute("aria-expanded", "false");
close.onclick = closeChat;
clear.onclick = () => { history.length = 0; save(); paint(); status.textContent = ""; input.focus(); };
let active: AbortController | null = null;
stop.onclick = () => active?.abort();
form.onsubmit = async (event) => {
  event.preventDefault();
  const message = input.value.trim(); if (!message || active) return;
  history.push({ role: "user", content: message }); save(); paint(); input.value = "";
  active = new AbortController(); send.disabled = true; stop.hidden = false; status.textContent = "Ожидание ответа…";
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history: history.slice(-20) }), signal: active.signal });
    const data: unknown = await response.json();
    const result = data as { reply?: unknown; error?: unknown };
    if (!response.ok || typeof result.reply !== "string") throw new Error(typeof result.error === "string" ? result.error : "Сервер чата пока не подключён");
    history.push({ role: "assistant", content: result.reply }); save(); paint(); status.textContent = "";
  } catch (error) { status.textContent = error instanceof Error && error.name === "AbortError" ? "Запрос остановлен" : (error instanceof Error ? error.message : "Ошибка подключения"); }
  finally { active = null; send.disabled = false; stop.hidden = true; input.focus(); }
};
input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) closeChat(); });
let pos: { x: number; y: number } = { x: 1, y: 1 };
try { const p = JSON.parse(localStorage.getItem(POS) || "null"); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pos = { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) }; } catch { /* no saved position */ }
const margin = 16;
function place() { const w = Math.max(0, innerWidth - 64 - margin * 2), h = Math.max(0, innerHeight - 64 - margin * 2); avatar.style.left = margin + pos.x * w + "px"; avatar.style.top = margin + pos.y * h + "px"; }
place(); window.addEventListener("resize", place);
avatar.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  const r = avatar.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
  let moved = false;
  avatar.setPointerCapture(e.pointerId);
  const move = (m: PointerEvent) => {
    if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return;
    moved = true; const w = Math.max(1, innerWidth - 64 - margin * 2), h = Math.max(1, innerHeight - 64 - margin * 2);
    pos = { x: Math.max(0, Math.min(1, (m.clientX - dx - margin) / w)), y: Math.max(0, Math.min(1, (m.clientY - dy - margin) / h)) }; place();
  };
  const up = () => { avatar.removeEventListener("pointermove", move); avatar.removeEventListener("pointerup", up); avatar.removeEventListener("pointercancel", up); if (moved) { avatar.dataset.dragged = "yes"; try { localStorage.setItem(POS, JSON.stringify(pos)); } catch {} } };
  avatar.addEventListener("pointermove", move); avatar.addEventListener("pointerup", up); avatar.addEventListener("pointercancel", up);
});
avatar.addEventListener("click", () => { if (avatar.dataset.dragged) { delete avatar.dataset.dragged; return; } openChat(); });
