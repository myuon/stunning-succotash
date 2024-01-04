import shaderVertSource from "./glsl/shader.vert?raw";
import shaderFragSource from "./glsl/shader.frag?raw";
import rendererVertSource from "./glsl/renderer.vert?raw";
import rendererFragSource from "./glsl/renderer.frag?raw";
import GUI from "lil-gui";
import Stats from "stats.js";
import cornellScene from "./scenes/cornell-box/scene.xml?raw";
import veachBidirScene from "./scenes/veach-bidir/scene.xml?raw";
import { loadScene, transformIntoCamera } from "./scene";
import { mat4, vec3, vec4 } from "gl-matrix";
import { createProgramFromSource, createVao, diagnoseGlError } from "./webgl";

const reflectionTypes = {
  diffuse: 0,
  specular: 1,
  refractive: 2,
};

const renderTypes = ["render", "color", "normal"];
const scenes = ["cornell-box", "veach-bidir"];

const main = async () => {
  const scene = await loadScene(veachBidirScene);
  const shapes: {
    type: "rectangle" | "cube";
    points: vec3[];
    color: vec3;
    emission: vec3;
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
        const mat = mat4.fromValues(
          shape.matrix[0],
          shape.matrix[4],
          shape.matrix[8],
          shape.matrix[12],
          shape.matrix[1],
          shape.matrix[5],
          shape.matrix[9],
          shape.matrix[13],
          shape.matrix[2],
          shape.matrix[6],
          shape.matrix[10],
          shape.matrix[14],
          shape.matrix[3],
          shape.matrix[7],
          shape.matrix[11],
          shape.matrix[15]
        );

        const p1 = vec4.create();
        vec4.transformMat4(p1, plane[0], mat);

        const p2 = vec4.create();
        vec4.transformMat4(p2, plane[1], mat);

        const p3 = vec4.create();
        vec4.transformMat4(p3, plane[2], mat);

        const p4 = vec4.create();
        vec4.transformMat4(p4, plane[3], mat);

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
      console.warn(
        `Unknown shape type: ${shape.type} (${JSON.stringify(shape)})`
      );
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

  const camera = {
    ...transformIntoCamera(
      "-1 0 0 0 0 1 0 1 0 0 -1 6.8 0 0 0 1".split(" ").map(parseFloat)
    ),
    screen_dist: 8,
  };
  console.log(camera);

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
    render_type: gl.getUniformLocation(program, "render_type"),
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

      const lookAt = vec3.create();
      vec3.scaleAndAdd(
        lookAt,
        camera.position,
        camera.direction,
        camera.screen_dist
      );

      let cam = vec3.create();
      vec3.subtract(cam, camera.position, lookAt);
      vec3.normalize(cam, cam);

      let phi = Math.atan2(cam[2], cam[0]);
      if (phi < 0) {
        phi += Math.PI * 2;
      } else if (phi > Math.PI * 2) {
        phi -= Math.PI * 2;
      }
      let theta = Math.acos(cam[1]);

      phi -= 0.01 * dx;
      theta += 0.01 * dy;

      cam = [
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi),
      ];

      vec3.scaleAndAdd(camera.position, lookAt, cam, camera.screen_dist);

      camera.direction = [-cam[0], -cam[1], -cam[2]];

      const right = vec3.create();
      vec3.cross(right, camera.direction, [0, 1, 0]);

      vec3.cross(camera.up, right, camera.direction);

      prevMousePosition = [e.clientX, e.clientY];
      reset();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "w") {
      const up = vec3.fromValues(camera.up[0], camera.up[1], camera.up[2]);
      vec3.scale(up, up, 0.1);

      vec3.add(camera.position, camera.position, up);
      iterations = 1;
      reset();
    } else if (e.key === "s") {
      const up = vec3.fromValues(camera.up[0], camera.up[1], camera.up[2]);
      vec3.scale(up, up, 0.1);

      vec3.subtract(camera.position, camera.position, up);
      iterations = 1;
      reset();
    } else if (e.key === "a") {
      const right = vec3.create();
      vec3.cross(right, camera.direction, camera.up);
      vec3.scale(right, right, 0.1);

      vec3.subtract(camera.position, camera.position, right);
      iterations = 1;
      reset();
    } else if (e.key === "d") {
      const right = vec3.create();
      vec3.cross(right, camera.direction, camera.up);
      vec3.scale(right, right, 0.1);

      vec3.add(camera.position, camera.position, right);
      iterations = 1;
      reset();
    } else if (e.key == "q") {
      camera.position = [
        camera.position[0] - camera.direction[0],
        camera.position[1] - camera.direction[1],
        camera.position[2] - camera.direction[2],
      ];
      iterations = 1;
      reset();
    } else if (e.key == "e") {
      camera.position = [
        camera.position[0] + camera.direction[0],
        camera.position[1] + camera.direction[1],
        camera.position[2] + camera.direction[2],
      ];
      iterations = 1;
      reset();
    }
  });

  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  const loadSettings = () => {
    try {
      const settings = localStorage.getItem("settings");

      return JSON.parse(settings ?? "");
    } catch (err) {
      return {
        tick: true,
        renderType: "render",
        spp: 1,
        scene: "cornell-box",
      };
    }
  };
  const saveSettings = (value: any) => {
    localStorage.setItem("settings", JSON.stringify(value));
  };

  const gui = new GUI();
  const value = loadSettings();
  gui.add(value, "tick").onChange((v: boolean) => {
    value.tick = v;
    saveSettings(value);
  });
  gui
    .add(value, "spp", [1, 2, 4, 8, 16, 32, 64, 128, 256])
    .onChange((v: number) => {
      value.spp = v;
      reset();
      saveSettings(value);
    });
  gui.add(value, "renderType", renderTypes).onChange((v: string) => {
    value.renderType = v;
    reset();
    saveSettings(value);
  });
  gui.add({ reset }, "reset");
  gui.add(value, "scene", scenes).onChange((v: string) => {
    value.scene = v;
    reset();
    saveSettings(value);
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
      vertex: vec3;
      edge1: vec3;
      edge2: vec3;
    }[];
    emission: vec3;
    color: vec3;
    reflection: "diffuse" | "specular" | "refractive";
  }[] = [];
  shapes.forEach((shape) => {
    if (shape.type === "rectangle") {
      const p0 = vec3.fromValues(
        shape.points[0][0],
        shape.points[0][1],
        shape.points[0][2]
      );
      const p1 = vec3.fromValues(
        shape.points[1][0],
        shape.points[1][1],
        shape.points[1][2]
      );
      const p2 = vec3.fromValues(
        shape.points[2][0],
        shape.points[2][1],
        shape.points[2][2]
      );
      const p3 = vec3.fromValues(
        shape.points[3][0],
        shape.points[3][1],
        shape.points[3][2]
      );

      let e10 = vec3.create();
      vec3.subtract(e10, p1, p0);

      let e20 = vec3.create();
      vec3.subtract(e20, p2, p0);

      let e30 = vec3.create();
      vec3.subtract(e30, p3, p0);

      rectangles.push({
        type: "rectangle",
        mesh: [
          {
            vertex: [p0[0], p0[1], p0[2]],
            edge1: [e10[0], e10[1], e10[2]],
            edge2: [e20[0], e20[1], e20[2]],
          },
          {
            vertex: [p0[0], p0[1], p0[2]],
            edge1: [e30[0], e30[1], e30[2]],
            edge2: [e20[0], e20[1], e20[2]],
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
      gl.uniform1i(
        programLocations.render_type,
        renderTypes.indexOf(value.renderType)
      );

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
