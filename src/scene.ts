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
}

export interface Scene {
  shapes: Shape[];
}

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> } | undefined;

export const loadScene = (xml: string) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, "text/xml");

  const parseRgb = (element: Element): [number, number, number] => {
    const rgb = element.getAttribute("value")!.split(" ");
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
  const parseShape = (element: Element): DeepPartial<Shape> => {
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
      }
    }

    return shape;
  };

  const scene: Scene = {
    shapes: [],
  };

  xmlDoc.querySelectorAll("shape").forEach((shape) => {
    const parsed = parseShape(shape);

    scene.shapes.push({
      ...parsed,
      type: shape.getAttribute("type")!,
    } as Shape);
  });

  return scene;
};

export const transformIntoCamera = (matrix: number[]) => {
  return {
    position: [matrix[3], matrix[7], matrix[11]],
    direction: [matrix[2], matrix[6], matrix[10]] as [number, number, number],
    up: [matrix[1], matrix[5], matrix[9]],
  };
};
