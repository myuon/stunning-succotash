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

export const loadMitsubaScene = async (xml: string) => {
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

const tokenizeMtl = (
  raw: string
): (
  | {
      type: "identifier";
      value: string;
    }
  | {
      type: "number";
      value: number;
    }
  | {
      type: "keyword";
      value: string;
    }
)[] => {
  let position = 0;
  const tokens: (
    | {
        type: "identifier";
        value: string;
      }
    | {
        type: "number";
        value: number;
      }
    | {
        type: "keyword";
        value: string;
      }
  )[] = [];

  while (position < raw.length) {
    if (raw[position] === "#") {
      while (raw[position] !== "\n") {
        position++;
      }

      continue;
    }

    if (
      raw[position] === " " ||
      raw[position] === "\n" ||
      raw[position] === "\r"
    ) {
      position++;
      continue;
    }

    const keywords = [
      "newmtl",
      "Ns",
      "Ni",
      "illum",
      "Ka",
      "Kd",
      "Ks",
      "Ke",
      "d",
      "Tr",
      "Tf",
    ];
    let should_continue = false;
    for (const keyword of keywords) {
      if (raw.slice(position).startsWith(keyword)) {
        tokens.push({
          type: "keyword",
          value: keyword,
        });
        position += keyword.length;
        should_continue = true;
        break;
      }
    }
    if (should_continue) continue;

    if (raw[position].match(/[a-zA-Z]/)) {
      const start = position;
      while (raw[position].match(/[a-zA-Z]/)) {
        position++;
      }
      tokens.push({
        type: "identifier",
        value: raw.slice(start, position),
      });
      continue;
    }
    if (raw[position].match(/[0-9\.]/)) {
      const start = position;
      while (raw[position].match(/[0-9\.]/)) {
        position++;
      }
      tokens.push({
        type: "number",
        value: parseFloat(raw.slice(start, position)),
      });
      continue;
    }

    throw new Error(`Unexpected token: ${raw.slice(position, position + 20)}`);
  }

  return tokens;
};

export interface Material {
  name: string;
  Ns?: number;
  Ni?: number;
  illum?: number;
  Ka?: vec3;
  Kd?: vec3;
  Ks?: vec3;
  Ke?: vec3;
  d?: number;
  Tr?: number;
  Tf?: vec3;
}

export const loadMtlScene = (raw: string) => {
  const tokens = tokenizeMtl(raw);
  let position = 0;

  const materials: Material[] = [];

  while (position < tokens.length) {
    const token = tokens[position];

    if (token.type === "keyword" && token.value === "newmtl") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "identifier") {
        throw new Error(`Unexpected token: ${nextToken}`);
      }

      const name = nextToken.value;
      const material = {
        name,
      };
      materials.push(material);
      position += 2;
      continue;
    } else if (token.type === "keyword" && token.value === "Ns") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "number") {
        throw new Error(`Unexpected token: ${nextToken}`);
      }
      materials[materials.length - 1].Ns = nextToken.value;
      position += 2;
      continue;
    } else if (token.type === "keyword" && token.value === "Ni") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "number") {
        throw new Error(`Unexpected token: ${nextToken}`);
      }
      materials[materials.length - 1].Ni = nextToken.value;
      position += 2;
      continue;
    } else if (token.type === "keyword" && token.value === "illum") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "number") {
        throw new Error(`Unexpected token: ${nextToken}`);
      }
      materials[materials.length - 1].illum = nextToken.value;
      position += 2;
      continue;
    } else if (token.type === "keyword" && token.value === "Ka") {
      const r = tokens[position + 1];
      const g = tokens[position + 2];
      const b = tokens[position + 3];

      if (r.type !== "number" || g.type !== "number" || b.type !== "number") {
        throw new Error(`Unexpected token: ${r} ${g} ${b}`);
      }

      materials[materials.length - 1].Ka = [r.value, g.value, b.value];
      position += 4;
      continue;
    } else if (token.type === "keyword" && token.value === "Kd") {
      const r = tokens[position + 1];
      const g = tokens[position + 2];
      const b = tokens[position + 3];

      if (r.type !== "number" || g.type !== "number" || b.type !== "number") {
        throw new Error(`Unexpected token: ${r} ${g} ${b}`);
      }

      materials[materials.length - 1].Kd = [r.value, g.value, b.value];
      position += 4;
      continue;
    } else if (token.type === "keyword" && token.value === "Ks") {
      const r = tokens[position + 1];
      const g = tokens[position + 2];
      const b = tokens[position + 3];

      if (r.type !== "number" || g.type !== "number" || b.type !== "number") {
        throw new Error(`Unexpected token: ${r} ${g} ${b}`);
      }

      materials[materials.length - 1].Ks = [r.value, g.value, b.value];
      position += 4;
      continue;
    } else if (token.type === "keyword" && token.value === "Ke") {
      const r = tokens[position + 1];
      const g = tokens[position + 2];
      const b = tokens[position + 3];

      if (r.type !== "number" || g.type !== "number" || b.type !== "number") {
        throw new Error(`Unexpected token: ${r} ${g} ${b}`);
      }

      materials[materials.length - 1].Ke = [r.value, g.value, b.value];
      position += 4;
      continue;
    } else if (token.type === "keyword" && token.value === "d") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "number") {
        throw new Error(`Unexpected token: ${nextToken}`);
      }
      materials[materials.length - 1].d = nextToken.value;
      position += 2;
      continue;
    } else if (token.type === "keyword" && token.value === "Tr") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "number") {
        throw new Error(`Unexpected token: ${nextToken}`);
      }
      materials[materials.length - 1].Tr = nextToken.value;
      position += 2;
      continue;
    } else if (token.type === "keyword" && token.value === "Tf") {
      const r = tokens[position + 1];
      const g = tokens[position + 2];
      const b = tokens[position + 3];

      if (r.type !== "number" || g.type !== "number" || b.type !== "number") {
        throw new Error(`Unexpected token: ${r} ${g} ${b}`);
      }

      materials[materials.length - 1].Tf = [r.value, g.value, b.value];
      position += 4;
      continue;
    } else {
      throw new Error(`Unexpected token: ${token}`);
    }
  }

  return materials;
};

const tokenizeObj = (raw: string) => {
  let position = 0;
  const tokens: (
    | {
        type: "identifier";
        value: string;
      }
    | {
        type: "number";
        value: number;
      }
    | {
        type: "keyword";
        value: string;
      }
  )[] = [];

  while (position < raw.length) {
    if (raw[position] === "#") {
      while (raw[position] !== "\n") {
        position++;
      }

      continue;
    }

    if (raw[position].match(/\s/)) {
      position++;
      continue;
    }

    const keywords = ["mtllib", "vt", "vn", "v", "g", "usemtl", "f"];
    let should_continue = false;
    for (const keyword of keywords) {
      if (
        raw.slice(position).startsWith(keyword) &&
        raw[position + keyword.length].match(/\s/)
      ) {
        tokens.push({
          type: "keyword",
          value: keyword,
        });
        position += keyword.length;
        should_continue = true;
        break;
      }
    }
    if (should_continue) continue;

    if (raw.slice(position, position + 2).match(/[a-zA-Z][a-zA-Z\-\.]/)) {
      const start = position;
      while (position < raw.length && raw[position].match(/[a-zA-Z\-\.]/)) {
        position++;
      }
      tokens.push({
        type: "identifier",
        value: raw.slice(start, position),
      });
      continue;
    }
    if (raw[position].match(/[0-9\.\-]/)) {
      const start = position;
      while (position < raw.length && raw[position].match(/[0-9\.\-]/)) {
        position++;
      }
      tokens.push({
        type: "number",
        value: parseFloat(raw.slice(start, position)),
      });
      continue;
    }

    console.log(raw[position].charCodeAt(0));

    throw new Error(`Unexpected token: ${raw.slice(position, position + 50)}`);
  }

  return tokens;
};

export interface SceneObj {
  mtllib?: string;
  objects: {
    name: string;
    faces: vec3[][];
    usemtl: string;
  }[];
}

export const loadObjScene = (raw: string) => {
  let position = 0;
  const tokens = tokenizeObj(raw);

  const scene: SceneObj = {
    objects: [],
  };
  let vertices: vec3[] = [];

  while (position < tokens.length) {
    const token = tokens[position];
    if (token.type === "keyword" && token.value === "mtllib") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "identifier") {
        throw new Error(`Unexpected token: ${nextToken}`);
      }
      scene.mtllib = nextToken.value;
      position += 2;
      continue;
    } else if (token.type === "keyword" && token.value === "v") {
      const x = tokens[position + 1];
      const y = tokens[position + 2];
      const z = tokens[position + 3];

      if (x.type !== "number" || y.type !== "number" || z.type !== "number") {
        throw new Error(
          `Unexpected token [v]: ${JSON.stringify(x)} ${JSON.stringify(
            y
          )} ${JSON.stringify(z)}`
        );
      }

      vertices.push([x.value, y.value, z.value]);
      position += 4;
      continue;
    } else if (token.type === "keyword" && token.value === "g") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "identifier") {
        throw new Error(`Unexpected token [g]: ${JSON.stringify(nextToken)}`);
      }
      const name = nextToken.value;

      if (scene.objects[scene.objects!.length - 1]?.name === name) {
        position += 2;
        continue;
      } else {
        const object = {
          name,
          faces: [],
          usemtl: "",
        };
        scene.objects.push(object);
        position += 2;
        continue;
      }
    } else if (token.type === "keyword" && token.value === "usemtl") {
      const nextToken = tokens[position + 1];
      if (nextToken.type !== "identifier") {
        throw new Error(`Unexpected token: ${nextToken}`);
      }

      if (scene.objects[scene.objects!.length - 1].usemtl === "") {
        scene.objects[scene.objects!.length - 1].usemtl = nextToken.value;
      } else {
        const name = nextToken.value;
        const object = {
          name,
          faces: [],
          usemtl: "",
        };
        scene.objects.push(object);
      }
      position += 2;
      continue;
    } else if (token.type === "keyword" && token.value === "f") {
      const t1 = tokens[position + 1];
      const t2 = tokens[position + 2];
      const t3 = tokens[position + 3];
      const t4 = tokens[position + 4];

      if (
        t1.type !== "number" ||
        t2.type !== "number" ||
        t3.type !== "number" ||
        t4.type !== "number"
      ) {
        throw new Error(`Unexpected token [f]: ${t1} ${t2} ${t3} ${t4}`);
      }

      scene.objects[scene.objects!.length - 1].faces.push([
        vertices[t1.value < 0 ? vertices.length + t1.value : t1.value],
        vertices[t2.value < 0 ? vertices.length + t2.value : t2.value],
        vertices[t3.value < 0 ? vertices.length + t3.value : t3.value],
        vertices[t4.value < 0 ? vertices.length + t4.value : t4.value],
      ]);
      position += 5;
      continue;
    } else {
      throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
    }
  }

  return scene;
};
