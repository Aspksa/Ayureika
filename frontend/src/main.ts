const canvas = document.querySelector<HTMLCanvasElement>("#surface");
if (canvas) {
  const resize = (): void => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener("resize", resize);
  resize();
}
