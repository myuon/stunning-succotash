import { vec3 } from "gl-matrix";

export interface Shape {
  type: string;
  bsdf?: {
    diffuse: boolean;
    reflectance: [number, number, number];
  };
  emitter?: {
    radiance: [number, number, number];
  };
  matrix: number[];
  model?: Triangle[];
}

export interface Scene {
  shapes: Shape[];
}

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> } | undefined;

export const loadScene = async (xml: string) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, "text/xml");

  const parseRgb = (element: Element): [number, number, number] => {
    const rgb = element.getAttribute("value")!.split(",");
    return [parseFloat(rgb[0]), parseFloat(rgb[1]), parseFloat(rgb[2])];
  };
  const parseBsdf = (element: Element): DeepPartial<Shape["bsdf"]> => {
    for (const child of element.children) {
      if (child.nodeName === "diffuse") {
        return {
          ...(parseBsdf(child) ?? {}),
          diffuse: true,
        };
      } else if (child.nodeName === "rgb") {
        return {
          reflectance: parseRgb(child),
        };
      }
    }
  };
  const parseShape = async (element: Element): Promise<DeepPartial<Shape>> => {
    let shape: DeepPartial<Shape> = {};

    for (const child of element.children) {
      if (child.nodeName === "bsdf") {
        shape.bsdf = parseBsdf(child);
      } else if (child.nodeName === "emitter") {
        shape.emitter = {
          radiance: parseRgb(child.children[0]),
        };
      } else if (child.nodeName === "ref") {
        shape = {
          ...shape,
          ...parseShape(xmlDoc.getElementById(child.getAttribute("id")!)!),
        };
      } else if (child.nodeName === "transform") {
        shape.matrix = child.children[0]
          .getAttribute("value")!
          .split(" ")
          .map(parseFloat);
      } else if (child.nodeName === "string") {
        shape.model = await loadObjFile(child.getAttribute("value")!);
      }
    }

    return shape;
  };

  const scene: Scene = {
    shapes: [],
  };

  const promises: (() => Promise<void>)[] = [];
  xmlDoc.querySelectorAll("shape").forEach((shape) => {
    promises.push(async () => {
      const parsed = await parseShape(shape);

      scene.shapes.push({
        ...parsed,
        type: shape.getAttribute("type")!,
      } as Shape);
    });
  });

  await Promise.all(promises.map((p) => p()));

  return scene;
};

export const transformIntoCamera = (matrix: number[]) => {
  return {
    position: [matrix[3], matrix[7], matrix[11]] as [number, number, number],
    direction: [matrix[2], matrix[6], matrix[10]] as [number, number, number],
    up: [matrix[1], matrix[5], matrix[9]] as [number, number, number],
  };
};

const sceneFiles = import.meta.glob("./scenes/**/*", { as: "raw" });

export interface Triangle {
  vertices: [vec3, vec3, vec3];
  normals: [vec3, vec3, vec3];
}

export const loadObjFile = async (objFile: string) => {
  const raw = await sceneFiles[`./scenes/veach-bidir/${objFile}`]();

  const vertices: vec3[] = [];
  const normals: vec3[] = [];
  const faces: Triangle[] = [];
  raw.split("\n").forEach((line) => {
    if (line.startsWith("v ")) {
      const [x, y, z] = line.split(" ").slice(1).map(parseFloat);
      vertices.push([x, y, z]);
    } else if (line.startsWith("vn ")) {
      const [x, y, z] = line.split(" ").slice(1).map(parseFloat);
      normals.push([x, y, z]);
    } else if (line.startsWith("f ")) {
      const [t1, t2, t3] = line
        .split(" ")
        .slice(1)
        .map((v) => {
          const [vi, ti, ni] = v.split("/").map((i) => parseInt(i) - 1);
          return [vi, ti, ni] as [number, number, number];
        });
      faces.push({
        vertices: [vertices[t1[0]], vertices[t2[0]], vertices[t3[0]]],
        normals: [normals[t1[2]], normals[t2[2]], normals[t3[2]]],
      });
    }
  });

  return faces;
};
