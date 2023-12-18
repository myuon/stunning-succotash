import shaderVertSource from "./glsl/shader.vert?raw";
import shaderFragSource from "./glsl/shader.frag?raw";
import accumRendererFragSource from "./glsl/accumRenderer.frag?raw";

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

const createVao = (
  gl: WebGL2RenderingContext,
  vboArray: WebGLBuffer[],
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

  vboArray.forEach((vbo, i) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(attrLocations[i]);
    gl.vertexAttribPointer(attrLocations[i], 3, gl.FLOAT, false, stides[i], 0);
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
    `#version 300 es

in vec3 position;
in vec2 a_texcoord;

out vec2 v_texcoord;

void main() {
  gl_Position = vec4(position, 1.0);
  v_texcoord = a_texcoord;
}
`,
    `#version 300 es

precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_texture;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texcoord);
}
`
  );
  if (!program) return;

  const programLocations = {
    position: gl.getAttribLocation(program, "position"),
    texcoord: gl.getAttribLocation(program, "a_texcoord"),
    texture: gl.getUniformLocation(program, "u_texture"),
  };

  const accumProgram = createProgramFromSource(
    gl,
    shaderVertSource,
    accumRendererFragSource
  );
  if (!accumProgram) return;

  const vao = createVao(
    gl,
    [
      createVbo(
        gl,
        [
          [-1.0, 1.0, 0.0],
          [1.0, 1.0, 0.0],
          [-1.0, -1.0, 0.0],
          [1.0, -1.0, 0.0],
        ].flat()
      )!,
    ],
    [programLocations.position],
    [3 * 4],
    [
      [0, 1, 2],
      [1, 2, 3],
    ].flat()
  );
  if (!vao) {
    console.error("Failed to create vertexArray");
    return;
  }

  const texcoordBuffer = gl.createBuffer();
  if (!texcoordBuffer) {
    console.error("Failed to create buffer");
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  gl.enableVertexAttribArray(programLocations.texcoord);
  gl.vertexAttribPointer(programLocations.texcoord, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const [texture, targetTexture] = new Array(2).map(() => {
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

  let count = 0;

  const loop = () => {
    // render to framebuffer -----------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // gl.viewport(0, 0, canvas.width, canvas.height);
    gl.viewport(100, 100, 200, 200);

    gl.clearColor(0.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // draw
    {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform1i(programLocations.texture, 0);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    // render to canvas ----------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    // gl.viewport(0, 0, canvas.width, canvas.height);
    gl.viewport(100, 100, 200, 200);

    gl.clearColor(1.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // draw
    {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform1i(programLocations.texture, 0);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    // tick ----------------------------------------------
    gl.flush();

    count++;

    requestAnimationFrame(loop);
  };
  loop();
};

main();
