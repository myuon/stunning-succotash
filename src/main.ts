const main = () => {
  const canvas = document.querySelector("#glcanvas")! as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2")!;

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
};

main();
