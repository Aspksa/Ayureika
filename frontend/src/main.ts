const canvas = document.querySelector<HTMLCanvasElement>("#surface");
const statusElement = document.querySelector<HTMLElement>("#status");
if (!canvas) throw new Error("Не найден Canvas #surface");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Браузер не поддерживает Canvas 2D");
function render(): void {
  const rect = canvas!.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas!.width = Math.max(1, Math.round(w * ratio));
  canvas!.height = Math.max(1, Math.round(h * ratio));
  ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx!.fillStyle = "#0b0b0d";
  ctx!.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, radius = Math.min(w, h) * 0.28;
  for (let ring = 3; ring >= 1; ring--) {
    ctx!.beginPath();
    ctx!.arc(cx, cy, radius * ring / 3, 0, Math.PI * 2);
    ctx!.strokeStyle = ring === 3 ? "#6c542d" : "#342a1b";
    ctx!.lineWidth = 1;
    ctx!.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius * .78;
    const y = cy + Math.sin(angle) * radius * .78;
    ctx!.beginPath();
    ctx!.moveTo(cx, cy);
    ctx!.lineTo(x, y);
    ctx!.strokeStyle = "#4b3c24";
    ctx!.stroke();
    ctx!.beginPath();
    ctx!.arc(x, y, 4, 0, Math.PI * 2);
    ctx!.fillStyle = "#d8b66a";
    ctx!.fill();
  }
  ctx!.textAlign = "center";
  ctx!.textBaseline = "middle";
  ctx!.fillStyle = "#d8b66a";
  ctx!.font = "600 " + Math.max(14, Math.min(25, w / 25)) + "px system-ui";
  ctx!.fillText("AYUREIKA", cx, cy);
}
window.addEventListener("resize", render);
render();
if (statusElement) statusElement.textContent = "Интерфейс работает · сервер запущен";
