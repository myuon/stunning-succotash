export const compileShader = (
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

export const createProgram = (
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

export const createProgramFromSource = (
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

export const createVbo = (gl: WebGL2RenderingContext, data: number[]) => {
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

export const createVao = (
  gl: WebGL2RenderingContext,
  vboDataArray: number[][],
  attrLocations: number[],
  attrSizes: number[],
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
    gl.vertexAttribPointer(
      attrLocations[i],
      attrSizes[i],
      gl.FLOAT,
      false,
      0,
      0
    );
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

export const diagnoseFramebuffer = (gl: WebGL2RenderingContext) => {
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

export const diagnoseGlError = (gl: WebGL2RenderingContext) => {
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
