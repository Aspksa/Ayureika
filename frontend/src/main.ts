const canvas = document.querySelector<HTMLCanvasElement>("#surface");
if (!canvas) {
  throw new Error("Не найден Canvas #surface");
}
const context = canvas.getContext("2d");
if (!context) {
  throw new Error("Браузер не поддерживает Canvas 2D");
}

function render(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas!.width = Math.round(width * ratio);
  canvas!.height = Math.round(height * ratio);
  context!.setTransform(ratio, 0, 0, ratio, 0, 0);

  context!.fillStyle = "#0b0b0d";
  context!.fillRect(0, 0, width, height);
  context!.textAlign = "center";
  context!.textBaseline = "middle";
  context!.fillStyle = "#d8b66a";
  context!.font = "600 " + Math.min(42, Math.max(26, width / 16)) + "px system-ui, sans-serif";
  context!.fillText("AYUREIKA", width / 2, height / 2 - 28);
  context!.fillStyle = "#d0d0d0";
  context!.font = Math.min(17, Math.max(13, width / 35)) + "px system-ui, sans-serif";
  context!.fillText("Веб-интерфейс загружен", width / 2, height / 2 + 24);
}
window.addEventListener("resize", render);
render();
