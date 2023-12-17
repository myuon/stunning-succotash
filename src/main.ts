import shaderVertSource from "./glsl/shader.vert?raw";
import shaderFragSource from "./glsl/shader.frag?raw";
import accumRendererFragSource from "./glsl/accumRenderer.frag?raw";
import { mat4 } from "gl-matrix";

const compileShader = (
  gl: WebGL2RenderingContext,
  shader: WebGLShader,
  source: string
) => {
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
  }
};

const createProgram = (
  gl: WebGL2RenderingContext,
  vertShader: WebGLShader,
  fragShader: WebGLShader
) => {
  const program = gl.createProgram();
  if (!program) {
    console.error("Failed to create program");
    return;
  }

  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.useProgram(program);

    return program;
  } else {
    console.error(gl.getProgramInfoLog(program));
  }
};

const createProgramFromSource = (
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string
) => {
  const vshader = gl.createShader(gl.VERTEX_SHADER);
  if (!vshader) {
    console.error("Failed to create vshader");
    return;
  }
  const fshader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fshader) {
    console.error("Failed to create fshader");
    return;
  }

  compileShader(gl, vshader, vertSource);
  compileShader(gl, fshader, fragSource);
  if (!vshader || !fshader) return;

  const program = createProgram(gl, vshader, fshader);
  if (!program) return;

  return program;
};

const createVbo = (gl: WebGL2RenderingContext, data: number[]) => {
  const vbo = gl.createBuffer();
  if (!vbo) {
    console.error("Failed to create buffer");
    return;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return vbo;
};

const createIbo = (gl: WebGL2RenderingContext, data: number[]) => {
  const ibo = gl.createBuffer();
  if (!ibo) {
    console.error("Failed to create buffer");
    return;
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Int16Array(data), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  return ibo;
};

const setAttribute = (
  gl: WebGL2RenderingContext,
  vbo: WebGLBuffer[],
  locations: number[],
  stride: number[]
) => {
  if (vbo.length !== locations.length || vbo.length !== stride.length) {
    console.error("Failed to set attribute");
    return;
  }

  vbo.forEach((v, i) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, v);
    gl.enableVertexAttribArray(locations[i]);
    gl.vertexAttribPointer(locations[i], stride[i], gl.FLOAT, false, 0, 0);
  });
};

const createFramebufferMrt = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  count: number
) => {
  const frameBuffer = gl.createFramebuffer();
  if (!frameBuffer) {
    console.error("Failed to create frameBuffer");
    return;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

  const textures = [];
  for (let i = 0; i < count; i++) {
    const tex = gl.createTexture();
    if (!tex) {
      console.error("Failed to create texture");
      return;
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0 + i,
      gl.TEXTURE_2D,
      tex,
      0
    );

    textures.push(tex);
  }

  const depthRenderBuffer = gl.createRenderbuffer();
  if (!depthRenderBuffer) {
    console.error("Failed to create renderbuffer");
    return;
  }

  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    depthRenderBuffer
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { frameBuffer, renderBuffer: depthRenderBuffer, textures };
};

const main = () => {
  const canvas = document.querySelector("#glcanvas")! as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("Failed to get WebGL context");
    return;
  }

  gl.getExtension("EXT_color_buffer_float")!;

  const program = createProgramFromSource(
    gl,
    shaderVertSource,
    shaderFragSource
  );
  if (!program) return;

  const accumProgram = createProgramFromSource(
    gl,
    shaderVertSource,
    accumRendererFragSource
  );
  if (!accumProgram) return;

  const indices = [
    [0, 1, 2],
    [1, 2, 3],
  ].flat();

  const vbo = createVbo(
    gl,
    [
      [0.0, 1.0, 0.0],
      [1.0, 0.0, 0.0],
      [-1.0, 0.0, 0.0],
      [0.0, -1.0, 0.0],
    ].flat()
  );
  if (!vbo) return;

  setAttribute(gl, [vbo], [gl.getAttribLocation(program, "position")], [3]);

  const ibo = createIbo(gl, indices);
  if (!ibo) return;

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

  const uniLocation = gl.getUniformLocation(program, "mvpMatrix");

  const mMatrix = mat4.identity(mat4.create());
  const vMatrix = mat4.identity(mat4.create());
  const pMatrix = mat4.identity(mat4.create());
  const tmpMatrix = mat4.identity(mat4.create());
  const mvpMatrix = mat4.identity(mat4.create());

  mat4.lookAt(vMatrix, [0.0, 0.0, 3.0], [0, 0, 0], [0, 1, 0]);
  mat4.perspective(pMatrix, 45, canvas.width / canvas.height, 0.1, 100);
  mat4.multiply(tmpMatrix, pMatrix, vMatrix);

  const bufferSize = 1024;

  const accumTexture = gl.createTexture();
  if (!accumTexture) {
    console.error("Failed to create texture");
    return;
  }
  gl.bindTexture(gl.TEXTURE_2D, accumTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    bufferSize,
    bufferSize,
    0,
    gl.RGBA,
    gl.FLOAT,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_NEAREST
  );
  gl.bindTexture(gl.TEXTURE_2D, null);

  const stateTexture = gl.createTexture();
  if (!stateTexture) {
    console.error("Failed to create texture");
    return;
  }
  gl.bindTexture(gl.TEXTURE_2D, stateTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32UI,
    bufferSize,
    bufferSize,
    0,
    gl.RED_INTEGER,
    gl.UNSIGNED_INT,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_NEAREST
  );
  gl.bindTexture(gl.TEXTURE_2D, null);

  const accumFbo = gl.createFramebuffer();
  if (!accumFbo) {
    console.error("Failed to create frameBuffer");
    return;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    accumTexture,
    0
  );
  gl.clearBufferfv(gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT1,
    gl.TEXTURE_2D,
    stateTexture,
    0
  );
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, accumTexture);
  gl.uniform1i(gl.getUniformLocation(program, "accumTexture"), 0);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.useProgram(accumProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, accumTexture);
  gl.uniform1i(gl.getUniformLocation(accumProgram, "accumTexture"), 0);
  gl.bindTexture(gl.TEXTURE_2D, null);

  let count = 0;

  const loop = () => {
    // render to framebuffer -----------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, bufferSize, bufferSize);

    gl.useProgram(program);

    const rad = (count % 360) * (Math.PI / 180);

    mat4.identity(mMatrix);
    mat4.rotate(mMatrix, mMatrix, rad, [0, 1, 0]);
    mat4.multiply(mvpMatrix, tmpMatrix, mMatrix);
    gl.uniformMatrix4fv(uniLocation, false, mvpMatrix);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    // render to canvas ----------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(accumProgram);

    gl.viewport(0, 0, canvas.width / 2, canvas.height);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    gl.viewport(canvas.width / 2, 0, canvas.width / 2, canvas.height);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    gl.useProgram(null);

    gl.flush();

    count++;

    requestAnimationFrame(loop);
  };
  loop();
};

main();
