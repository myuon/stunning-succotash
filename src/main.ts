import shaderVertSource from "./glsl/shader.vert?raw";
import shaderFragSource from "./glsl/shader.frag?raw";
import rendererFragSource from "./glsl/renderer.frag?raw";

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

const createVao = (
  gl: WebGL2RenderingContext,
  vboDataArray: number[][],
  attrLocations: number[],
  stides: number[],
  iboData: number[]
) => {
  const vao = gl.createVertexArray();
  if (!vao) {
    console.error("Failed to create vertexArray");
    return;
  }
  gl.bindVertexArray(vao);

  vboDataArray.forEach((vboData, i) => {
    const vbo = createVbo(gl, vboData);
    if (!vbo) {
      throw new Error("Failed to create vbo");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(attrLocations[i]);
    gl.vertexAttribPointer(attrLocations[i], stides[i], gl.FLOAT, false, 0, 0);
  });
  if (iboData) {
    const ibo = gl.createBuffer();
    if (!ibo) {
      console.error("Failed to create buffer");
      return;
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Int16Array(iboData),
      gl.STATIC_DRAW
    );
  }
  gl.bindVertexArray(null);

  return vao;
};

const diagnoseFramebuffer = (gl: WebGL2RenderingContext) => {
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  switch (status) {
    case gl.FRAMEBUFFER_COMPLETE:
      console.log("FRAMEBUFFER_COMPLETE");
      break;
    case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
      console.warn("FRAMEBUFFER_INCOMPLETE_ATTACHMENT");
      break;
    case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
      console.warn("FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT");
      break;
    case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
      console.warn("FRAMEBUFFER_INCOMPLETE_DIMENSIONS");
      break;
    case gl.FRAMEBUFFER_UNSUPPORTED:
      console.warn("FRAMEBUFFER_UNSUPPORTED");
      break;
    default:
      console.error("Unknown framebuffer status");
      break;
  }
};

const diagnoseGlError = (gl: WebGL2RenderingContext) => {
  const error = gl.getError();
  switch (error) {
    case gl.NO_ERROR:
      console.log("NO_ERROR");
      break;
    case gl.INVALID_ENUM:
      console.warn("INVALID_ENUM");
      break;
    case gl.INVALID_VALUE:
      console.warn("INVALID_VALUE");
      break;
    case gl.INVALID_OPERATION:
      console.warn("INVALID_OPERATION");
      break;
    case gl.INVALID_FRAMEBUFFER_OPERATION:
      console.warn("INVALID_FRAMEBUFFER_OPERATION");
      break;
    case gl.OUT_OF_MEMORY:
      console.warn("OUT_OF_MEMORY");
      break;
    case gl.CONTEXT_LOST_WEBGL:
      console.warn("CONTEXT_LOST_WEBGL");
      break;
    default:
      console.error("Unknown error");
      break;
  }
};

const main = () => {
  const canvas = document.querySelector("#glcanvas")! as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("Failed to get WebGL context");
    return;
  }

  console.log(gl.getExtension("EXT_color_buffer_float")!);

  const program = createProgramFromSource(
    gl,
    shaderVertSource,
    shaderFragSource
  );
  if (!program) return;

  const programLocations = {
    position: gl.getAttribLocation(program, "position"),
    texcoord: gl.getAttribLocation(program, "a_texcoord"),
    texture: gl.getUniformLocation(program, "u_texture"),
    delta: gl.getUniformLocation(program, "delta"),
    resolution: gl.getUniformLocation(program, "resolution"),
  };

  const shaderVao = createVao(
    gl,
    [
      [
        [-1.0, 1.0, 0.0],
        [1.0, 1.0, 0.0],
        [-1.0, -1.0, 0.0],
        [1.0, -1.0, 0.0],
      ].flat(),
      [
        [-1.0, 1.0],
        [1.0, 1.0],
        [-1.0, -1.0],
        [1.0, -1.0],
      ].flat(),
    ],
    [programLocations.position, programLocations.texcoord],
    [3, 2],
    [
      [0, 1, 2],
      [1, 2, 3],
    ].flat()
  );
  if (!shaderVao) {
    console.error("Failed to create vertexArray");
    return;
  }

  const rendererProgram = createProgramFromSource(
    gl,
    shaderVertSource,
    rendererFragSource
  );
  if (!rendererProgram) return;

  const rendererProgramLocations = {
    position: gl.getAttribLocation(rendererProgram, "position"),
    texcoord: gl.getAttribLocation(rendererProgram, "a_texcoord"),
    texture: gl.getUniformLocation(rendererProgram, "u_texture"),
    sppInv: gl.getUniformLocation(rendererProgram, "spp_inv"),
  };

  const rendererVao = createVao(
    gl,
    [
      [
        [-1.0, 1.0, 0.0],
        [1.0, 1.0, 0.0],
        [-1.0, -1.0, 0.0],
        [1.0, -1.0, 0.0],
      ].flat(),
      [
        [-1.0, 1.0],
        [1.0, 1.0],
        [-1.0, -1.0],
        [1.0, -1.0],
      ].flat(),
    ],
    [rendererProgramLocations.position, rendererProgramLocations.texcoord],
    [3, 2],
    [
      [0, 1, 2],
      [1, 2, 3],
    ].flat()
  );
  if (!rendererVao) {
    console.error("Failed to create vertexArray");
    return;
  }

  const [targetTexture] = new Array(1).map(() => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.activeTexture(gl.TEXTURE0);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      canvas.width,
      canvas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    return tex;
  });

  const fbo = gl.createFramebuffer();
  if (!fbo) {
    console.error("Failed to create frameBuffer");
    return;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    targetTexture,
    0
  );

  let delta = 1;

  const loop = () => {
    // render to framebuffer -----------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.clearColor(0.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // draw
    {
      gl.useProgram(program);
      gl.bindVertexArray(shaderVao);
      gl.uniform1i(programLocations.texture, 0);
      gl.uniform1i(programLocations.delta, delta);
      gl.uniform2f(programLocations.resolution, canvas.width, canvas.height);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    // render to canvas ----------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.clearColor(1.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // draw
    {
      gl.useProgram(rendererProgram);
      gl.bindVertexArray(rendererVao);
      gl.uniform1i(rendererProgramLocations.texture, 0);
      gl.uniform1f(rendererProgramLocations.sppInv, 1.0 / delta);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    // tick ----------------------------------------------
    gl.flush();

    delta++;

    requestAnimationFrame(loop);
  };
  loop();
};

main();
