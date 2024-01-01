import shaderVertSource from "./glsl/shader.vert?raw";
import shaderFragSource from "./glsl/shader.frag?raw";
import rendererVertSource from "./glsl/renderer.vert?raw";
import rendererFragSource from "./glsl/renderer.frag?raw";
import GUI from "lil-gui";
import Stats from "stats.js";
import cornellScene from "./scenes/cornell.xml?raw";
import { loadScene, transformIntoCamera } from "./scene";

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

// @ts-ignore
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

// @ts-ignore
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

const subtractVec3 = (
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] => {
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;

  return [ax - bx, ay - by, az - bz];
};

const applyMat4 = (
  mat: number[],
  vec: [number, number, number, number]
): [number, number, number, number] => {
  return [
    vec[0] * mat[0] + vec[1] * mat[1] + vec[2] * mat[2] + vec[3] * mat[3],
    vec[0] * mat[4] + vec[1] * mat[5] + vec[2] * mat[6] + vec[3] * mat[7],
    vec[0] * mat[8] + vec[1] * mat[9] + vec[2] * mat[10] + vec[3] * mat[11],
    vec[0] * mat[12] + vec[1] * mat[13] + vec[2] * mat[14] + vec[3] * mat[15],
  ];
};

const reflectionTypes = {
  diffuse: 0,
  specular: 1,
  refractive: 2,
};

const main = () => {
  const scene = loadScene(cornellScene);
  const shapes: {
    type: "rectangle" | "cube";
    points: [number, number, number][];
    color: [number, number, number];
    emission: [number, number, number];
    reflection: "diffuse" | "specular" | "refractive";
  }[] = [];
  scene.shapes.forEach((shape) => {
    if (shape.type === "rectangle") {
      shapes.push({
        type: "rectangle",
        points: [
          [
            -shape.matrix[0] - shape.matrix[1] + shape.matrix[3],
            -shape.matrix[4] - shape.matrix[5] + shape.matrix[7],
            -shape.matrix[8] - shape.matrix[9] + shape.matrix[11],
          ],
          [
            shape.matrix[0] - shape.matrix[1] + shape.matrix[3],
            shape.matrix[4] - shape.matrix[5] + shape.matrix[7],
            shape.matrix[8] - shape.matrix[9] + shape.matrix[11],
          ],
          [
            shape.matrix[0] + shape.matrix[1] + shape.matrix[3],
            shape.matrix[4] + shape.matrix[5] + shape.matrix[7],
            shape.matrix[8] + shape.matrix[9] + shape.matrix[11],
          ],
          [
            -shape.matrix[0] + shape.matrix[1] + shape.matrix[3],
            -shape.matrix[4] + shape.matrix[5] + shape.matrix[7],
            -shape.matrix[8] + shape.matrix[9] + shape.matrix[11],
          ],
        ],
        color: shape.bsdf?.reflectance ?? [0.0, 0.0, 0.0],
        emission: [
          shape.emitter?.radiance[0] ?? 0.0,
          shape.emitter?.radiance[1] ?? 0.0,
          shape.emitter?.radiance[2] ?? 0.0,
        ],
        reflection: "diffuse",
      });
    } else if (shape.type === "cube") {
      const planes = [
        [
          [-1, 1, -1, 1],
          [-1, -1, -1, 1],
          [1, -1, -1, 1],
          [1, 1, -1, 1],
        ],
        [
          [-1, 1, 1, 1],
          [-1, -1, 1, 1],
          [1, -1, 1, 1],
          [1, 1, 1, 1],
        ],
        [
          [-1, 1, 1, 1],
          [-1, 1, -1, 1],
          [1, 1, -1, 1],
          [1, 1, 1, 1],
        ],
        [
          [-1, -1, 1, 1],
          [-1, -1, -1, 1],
          [1, -1, -1, 1],
          [1, -1, 1, 1],
        ],
        [
          [1, 1, -1, 1],
          [1, -1, -1, 1],
          [1, -1, 1, 1],
          [1, 1, 1, 1],
        ],
        [
          [-1, 1, -1, 1],
          [-1, -1, -1, 1],
          [-1, -1, 1, 1],
          [-1, 1, 1, 1],
        ],
      ] as [number, number, number, number][][];
      planes.forEach((plane) => {
        const p1 = applyMat4(shape.matrix, plane[0]);
        const p2 = applyMat4(shape.matrix, plane[1]);
        const p3 = applyMat4(shape.matrix, plane[2]);
        const p4 = applyMat4(shape.matrix, plane[3]);

        shapes.push({
          type: "rectangle",
          points: [
            [p1[0], p1[1], p1[2]],
            [p2[0], p2[1], p2[2]],
            [p3[0], p3[1], p3[2]],
            [p4[0], p4[1], p4[2]],
          ],
          color: shape.bsdf?.reflectance ?? [0.0, 0.0, 0.0],
          emission: [
            shape.emitter?.radiance[0] ?? 0.0,
            shape.emitter?.radiance[1] ?? 0.0,
            shape.emitter?.radiance[2] ?? 0.0,
          ],
          reflection: "diffuse",
        });
      });
    } else {
      console.warn(`Unknown shape type: ${shape.type} (${shape})`);
    }
  });

  const output = document.getElementById("output")! as HTMLDivElement;
  const canvas = document.getElementById("glcanvas")! as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("Failed to get WebGL context");
    return;
  }

  console.log(gl.getExtension("EXT_color_buffer_float")!);

  // const camera = {
  //   position: [50.0, 52.0, 220.0] as [number, number, number],
  //   direction: [0.0, -0.04, -1.0] as [number, number, number],
  //   up: [0.0, 1.0, 0.0] as [number, number, number],
  //   screen_dist: 80.0,
  // };
  const camera = {
    ...transformIntoCamera(
      "-1 0 0 0 0 1 0 1 0 0 -1 6.8 0 0 0 1".split(" ").map(parseFloat)
    ),
    screen_dist: 15 / Math.tan((19.5 * 2 * Math.PI) / 360 / 2),
  };

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
    iterations: gl.getUniformLocation(program, "iterations"),
    resolution: gl.getUniformLocation(program, "resolution"),
    camera_position: gl.getUniformLocation(program, "camera_position"),
    camera_direction: gl.getUniformLocation(program, "camera_direction"),
    camera_up: gl.getUniformLocation(program, "camera_up"),
    screen_dist: gl.getUniformLocation(program, "screen_dist"),
    spp: gl.getUniformLocation(program, "spp"),
    n_spheres: gl.getUniformLocation(program, "n_spheres"),
    n_rectangles: gl.getUniformLocation(program, "n_rectangles"),
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
    rendererVertSource,
    rendererFragSource
  );
  if (!rendererProgram) return;

  const rendererProgramLocations = {
    position: gl.getAttribLocation(rendererProgram, "position"),
    texcoord: gl.getAttribLocation(rendererProgram, "a_texcoord"),
    texture: gl.getUniformLocation(rendererProgram, "u_texture"),
    iterations: gl.getUniformLocation(rendererProgram, "iterations"),
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

  const textures = Array.from({ length: 2 }).map(() => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.activeTexture(gl.TEXTURE0);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      canvas.width,
      canvas.height,
      0,
      gl.RGBA,
      gl.FLOAT,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return tex;
  });

  const reset = () => {
    // clear textures
    textures.forEach((tex) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        canvas.width,
        canvas.height,
        0,
        gl.RGBA,
        gl.FLOAT,
        null
      );
      gl.bindTexture(gl.TEXTURE_2D, null);
    });

    iterations = 1;
  };

  const fbo = gl.createFramebuffer();
  if (!fbo) {
    console.error("Failed to create frameBuffer");
    return;
  }

  let iterations = 1;

  let angleX = 0.0;
  let angleY = 0.0;

  let prevMousePosition: [number, number] | null = null;
  canvas.addEventListener("mousedown", (e) => {
    prevMousePosition = [e.clientX, e.clientY];
  });
  canvas.addEventListener("mouseup", () => {
    prevMousePosition = null;
  });
  canvas.addEventListener("mousemove", (e) => {
    if (prevMousePosition) {
      const dx = e.clientX - prevMousePosition[0];
      const dy = e.clientY - prevMousePosition[1];

      angleX += dy * 0.01;
      angleY -= dx * 0.01;

      angleX = Math.max(Math.min(angleX, Math.PI / 2), -Math.PI / 2);
      angleY = angleY % (Math.PI * 2);

      camera.direction = [
        Math.cos(angleX) * Math.sin(angleY),
        Math.sin(angleX),
        -Math.cos(angleX) * Math.cos(angleY),
      ];

      prevMousePosition = [e.clientX, e.clientY];
      reset();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "w") {
      camera.position = [
        camera.position[0] + camera.direction[0],
        camera.position[1] + camera.direction[1],
        camera.position[2] + camera.direction[2],
      ];
      iterations = 1;
      reset();
    } else if (e.key === "s") {
      camera.position = [
        camera.position[0] - camera.direction[0],
        camera.position[1] - camera.direction[1],
        camera.position[2] - camera.direction[2],
      ];
      iterations = 1;
      reset();
    } else if (e.key === "a") {
      const right = [
        camera.direction[1] * camera.up[2] - camera.direction[2] * camera.up[1],
        camera.direction[2] * camera.up[0] - camera.direction[0] * camera.up[2],
        camera.direction[0] * camera.up[1] - camera.direction[1] * camera.up[0],
      ];
      camera.position = [
        camera.position[0] - right[0],
        camera.position[1] - right[1],
        camera.position[2] - right[2],
      ];
      iterations = 1;
      reset();
    } else if (e.key === "d") {
      const right = [
        camera.direction[1] * camera.up[2] - camera.direction[2] * camera.up[1],
        camera.direction[2] * camera.up[0] - camera.direction[0] * camera.up[2],
        camera.direction[0] * camera.up[1] - camera.direction[1] * camera.up[0],
      ];
      camera.position = [
        camera.position[0] + right[0],
        camera.position[1] + right[1],
        camera.position[2] + right[2],
      ];
      iterations = 1;
      reset();
    }
  });

  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  const gui = new GUI();
  const value = {
    tick: true,
    spp: 1,
  };
  gui.add(value, "tick").onChange((v: boolean) => {
    value.tick = v;
  });
  gui
    .add(value, "spp", [1, 2, 4, 8, 16, 32, 64, 128, 256])
    .onChange((v: number) => {
      value.spp = v;
      reset();
    });

  const MAX_N_SPHERES = 100;
  const spheres = [
    {
      center: [1e5 + 1.0, 40.8, 81.6],
      radius: 1e5,
      emission: [0.0, 0.0, 0.0],
      color: [0.75, 0.25, 0.25],
      reflection: "diffuse",
    },
    {
      center: [-1e5 + 99.0, 40.8, 81.6],
      radius: 1e5,
      emission: [0.0, 0.0, 0.0],
      color: [0.25, 0.25, 0.75],
      reflection: "diffuse",
    },
    {
      center: [50.0, 40.8, 1e5],
      radius: 1e5,
      emission: [0.0, 0.0, 0.0],
      color: [0.75, 0.75, 0.75],
      reflection: "diffuse",
    },
    {
      center: [50.0, 40.8, -1e5 + 250.0],
      radius: 1e5,
      emission: [0.0, 0.0, 0.0],
      color: [0.0, 0.0, 0.0],
      reflection: "diffuse",
    },
    {
      center: [50.0, 1e5, 81.6],
      radius: 1e5,
      emission: [0.0, 0.0, 0.0],
      color: [0.75, 0.75, 0.75],
      reflection: "diffuse",
    },
    {
      center: [50.0, -1e5 + 81.6, 81.6],
      radius: 1e5,
      emission: [0.0, 0.0, 0.0],
      color: [0.75, 0.75, 0.75],
      reflection: "diffuse",
    },
    {
      center: [50.0, 90.0, 81.6],
      radius: 15.0,
      emission: [36.0, 36.0, 36.0],
      color: [0.0, 0.0, 0.0],
      reflection: "diffuse",
    },
    {
      center: [65.0, 20.0, 20.0],
      radius: 20.0,
      emission: [0.0, 0.0, 0.0],
      color: [0.25, 0.75, 0.25],
      reflection: "diffuse",
    },
    {
      center: [27.0, 16.5, 47.0],
      radius: 16.5,
      emission: [0.0, 0.0, 0.0],
      color: [0.99, 0.99, 0.99],
      reflection: "specular",
    },
    {
      center: [77.0, 16.5, 78.0],
      radius: 16.5,
      emission: [0.0, 0.0, 0.0],
      color: [0.99, 0.99, 0.99],
      reflection: "refractive",
    },
  ] as const;
  const sceneData = new Float32Array(
    Array.from({
      length: MAX_N_SPHERES,
    })
      .map((_, i) => {
        const sphere = spheres[i] || {
          center: [0.0, 0.0, 0.0],
          radius: 0.0,
          emission: [0.0, 0.0, 0.0],
          color: [0.0, 0.0, 0.0],
          reflection: "diffuse",
        };

        return [
          ...sphere.center,
          sphere.radius,
          ...sphere.emission,
          0.0, // is this happening because of padding?
          ...sphere.color,
          reflectionTypes[sphere.reflection],
        ];
      })
      .flat()
  );

  const MAX_N_RECTANGLES = 100;
  const rectangles: {
    type: "rectangle";
    mesh: {
      vertex: [number, number, number];
      edge1: [number, number, number];
      edge2: [number, number, number];
    }[];
    emission: [number, number, number];
    color: [number, number, number];
    reflection: "diffuse" | "specular" | "refractive";
  }[] = [];
  shapes.forEach((shape) => {
    if (shape.type === "rectangle") {
      rectangles.push({
        type: "rectangle",
        mesh: [
          {
            vertex: shape.points[0],
            edge1: subtractVec3(shape.points[1], shape.points[0]),
            edge2: subtractVec3(shape.points[2], shape.points[0]),
          },
          {
            vertex: shape.points[0],
            edge1: subtractVec3(shape.points[2], shape.points[0]),
            edge2: subtractVec3(shape.points[3], shape.points[0]),
          },
        ],
        emission: shape.emission,
        color: shape.color,
        reflection: shape.reflection,
      });
    }
  });
  const rectanglesData = new Float32Array(
    Array.from({
      length: MAX_N_RECTANGLES,
    })
      .map((_, i) => {
        const rectangle = rectangles[i] ?? {
          mesh: [
            {
              vertex: [0.0, 0.0, 0.0],
              edge1: [0.0, 0.0, 0.0],
              edge2: [0.0, 0.0, 0.0],
            },
            {
              vertex: [0.0, 0.0, 0.0],
              edge1: [0.0, 0.0, 0.0],
              edge2: [0.0, 0.0, 0.0],
            },
          ],
          emission: [0.0, 0.0, 0.0],
          color: [0.0, 0.0, 0.0],
          reflection: "diffuse",
        };

        return [
          ...rectangle.mesh[0].vertex,
          0.0, // padding
          ...rectangle.mesh[0].edge1,
          0.0, // padding
          ...rectangle.mesh[0].edge2,
          0.0, // padding
          ...rectangle.mesh[1].vertex,
          0.0, // padding
          ...rectangle.mesh[1].edge1,
          0.0, // padding
          ...rectangle.mesh[1].edge2,
          0.0, // padding
          ...rectangle.emission,
          0.0, // padding
          ...rectangle.color,
          reflectionTypes[rectangle.reflection],
        ];
      })
      .flat()
  );

  gl.uniformBlockBinding(
    program,
    gl.getUniformBlockIndex(program, "Spheres"),
    0
  );
  gl.uniformBlockBinding(
    program,
    gl.getUniformBlockIndex(program, "Rectangles"),
    1
  );

  const sphereUbo = gl.createBuffer();
  if (!sphereUbo) {
    console.error("Failed to create buffer");
    return;
  }

  gl.bindBuffer(gl.UNIFORM_BUFFER, sphereUbo);
  gl.bufferData(gl.UNIFORM_BUFFER, sceneData, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.UNIFORM_BUFFER, null);

  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, sphereUbo);

  const rectangleUbo = gl.createBuffer();
  if (!rectangleUbo) {
    console.error("Failed to create buffer");
    return;
  }

  gl.bindBuffer(gl.UNIFORM_BUFFER, rectangleUbo);
  gl.bufferData(gl.UNIFORM_BUFFER, rectanglesData, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.UNIFORM_BUFFER, null);

  gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, rectangleUbo);

  const loop = () => {
    stats.begin();

    if (value.tick || iterations < 5) {
      // render --------------------------------------------
      gl.useProgram(program);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[0]);
      gl.uniform1i(programLocations.texture, 0);
      gl.uniform1i(programLocations.iterations, iterations);
      gl.uniform2f(programLocations.resolution, canvas.width, canvas.height);
      gl.uniform3fv(programLocations.camera_position, camera.position);
      gl.uniform3fv(programLocations.camera_direction, camera.direction);
      gl.uniform3fv(programLocations.camera_up, camera.up);
      gl.uniform1f(programLocations.screen_dist, camera.screen_dist);
      gl.uniform1i(programLocations.spp, value.spp);
      gl.uniform1i(programLocations.n_spheres, 0);
      gl.uniform1i(programLocations.n_rectangles, rectangles.length);

      gl.bindVertexArray(shaderVao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        textures[1],
        0
      );

      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      textures.reverse();

      // renderer ------------------------------------------
      gl.useProgram(rendererProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[0]);
      gl.uniform1i(rendererProgramLocations.texture, 0);
      gl.uniform1i(rendererProgramLocations.iterations, iterations);

      gl.bindVertexArray(rendererVao);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      if (!value.tick) {
        diagnoseGlError(gl);
      }

      // tick ----------------------------------------------
      gl.flush();

      iterations++;
    }

    stats.end();

    requestAnimationFrame(loop);

    if (iterations % 25 == 0) {
      output.innerHTML = `iterations: ${iterations}`;
    }
  };

  requestAnimationFrame(loop);
};

main();
