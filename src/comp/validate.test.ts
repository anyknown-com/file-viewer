// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";
import type { Manifest } from "./manifest";
import { validateLikeCompositor } from "./validate";

type Json = Record<string, unknown>;

// Distinct first 8 characters per layer, so a message can be tied to its layer.
const id = (n: number): string =>
  `${n.toString(16).toUpperCase().padStart(8, "0")}-0000-4000-8000-000000000000`;
const id8 = (n: number): string => id(n).slice(0, 8);

const transform = (w = 1920, h = 1080): Json => ({
  origin: [0, 0],
  size: [w, h],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality",
});

// The one layer of the minimal manifest in Compositor docs/writing-comp-files.md @11d8d7a.
const layer = (n: number, extra: Json = {}): Json => ({
  id: id(n),
  name: n === 1 ? "Background" : `Layer ${n}`,
  imageFile: `${id(n)}.png`,
  isVisible: true,
  isGroup: false,
  opacity: 1,
  blendMode: "Normal",
  transform: transform(),
  ...extra,
});
// `undefined` drops the key when the manifest is serialized.
const folder = (n: number, extra: Json = {}): Json =>
  layer(n, { isGroup: true, imageFile: undefined, ...extra });

const manifest = (layers: Json[], top: Json = {}): Json => ({
  format: "com.compositor.project",
  version: 11,
  colorSpace: "sRGB",
  documentID: "0C5E7A91-3B2D-4F6A-8E1C-9D0B7A6F5E4D",
  width: 1920,
  height: 1080,
  resolution: 72,
  activeLayerID: id(1),
  layers,
  ...top,
});

const parse = (m: Json): Manifest => parseManifest(new TextEncoder().encode(JSON.stringify(m)));
const run = (m: Json): string[] => validateLikeCompositor(parse(m));
const runLayers = (layers: Json[], top: Json = {}): string[] => run(manifest(layers, top));

/** The only message, which must name `owner` (a layer's first 8 id characters, or "manifest:"). */
function one(problems: string[], owner: string): string {
  expect(problems).toHaveLength(1);
  const [problem = ""] = problems;
  expect(problem).toContain(owner);
  return problem;
}

// The Curves example from Compositor docs/writing-comp-files.md @11d8d7a.
const points = (...xy: [number, number][]): Json[] => xy.map(([x, y]) => ({ x, y }));
const identityRange = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };
const curvesLayer: Json = {
  id: "A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D",
  name: "Warm Grade",
  isVisible: true,
  isGroup: false,
  opacity: 1,
  blendMode: "Normal",
  transform: transform(),
  adjustment: {
    kind: "Curves",
    hue: 0,
    saturation: 0,
    lightness: 0,
    colorize: false,
    levels: { channel: "RGB", ranges: Array.from({ length: 4 }, () => identityRange) },
    curves: {
      channel: "RGB",
      channels: [
        points([0, 0], [255, 255]),
        points([0, 0], [120, 147], [255, 255]),
        points([0, 0], [100, 114], [255, 255]),
        points([0, 0], [115, 97], [255, 238]),
      ],
    },
  },
};

describe("validateLikeCompositor: valid manifests", () => {
  it("accepts the minimal manifest and the Curves example", () => {
    expect(runLayers([layer(1)])).toEqual([]);
    expect(runLayers([layer(1), curvesLayer])).toEqual([]);
  });

  it("accepts boundary values", () => {
    expect(runLayers([layer(1, { opacity: 0 }), layer(2, { opacity: 1 })])).toEqual([]);
    expect(runLayers([layer(1)], { width: 30_000, height: 30_000 })).toEqual([]);
    // 64 nested folders, a layer inside the deepest: 64 ancestors.
    const nested = Array.from({ length: 64 }, (_, i) =>
      folder(i + 2, i === 0 ? {} : { parentID: id(i + 1) }),
    );
    expect(runLayers([layer(1), ...nested, layer(100, { parentID: id(65) })])).toEqual([]);
    // 256 layers, each clipped to the one before: a chain of 255.
    const chain = Array.from({ length: 256 }, (_, i) =>
      layer(i + 1, i === 0 ? {} : { maskSourceID: id(i) }),
    );
    expect(runLayers(chain)).toEqual([]);
  });
});

const guide = (n: number, position = 10): Json => ({ id: id(n), axis: "vertical", position });

describe("validateLikeCompositor: manifest", () => {
  const base = parse(manifest([layer(1)]));

  it("checks format, version and color space", () => {
    expect(one(validateLikeCompositor({ ...base, format: "x" }), "manifest:")).toContain("format");
    expect(one(validateLikeCompositor({ ...base, version: 12 }), "manifest:")).toContain("version");
    expect(one(runLayers([layer(1)], { version: 0 }), "manifest:")).toContain("version");
    expect(one(runLayers([layer(1)], { colorSpace: "Display P3" }), "manifest:")).toContain(
      "colorSpace",
    );
  });

  it("checks resolution and canvas size", () => {
    expect(one(runLayers([layer(1)], { resolution: 0 }), "manifest:")).toContain("resolution");
    expect(one(runLayers([layer(1)], { resolution: 9601 }), "manifest:")).toContain("resolution");
    expect(one(runLayers([layer(1)], { width: 30_001 }), "manifest:")).toContain("width");
    expect(one(runLayers([layer(1)], { height: 0 }), "manifest:")).toContain("height");
  });

  it("checks the layer count and the active layer", () => {
    const layers = Array.from({ length: 10_001 }, (_, i) => ({
      ...base.layers[0]!,
      id: id(i + 1),
      imageFile: undefined,
    }));
    expect(
      one(validateLikeCompositor({ ...base, layers, activeLayerID: undefined }), "manifest:"),
    ).toContain("layers");
    expect(one(runLayers([layer(1)], { activeLayerID: id(9) }), "manifest:")).toContain(
      "activeLayerID",
    );
  });

  it("checks guides", () => {
    expect(runLayers([layer(1)], { version: 7, guides: [] })).toEqual([]);
    expect(one(runLayers([layer(1)], { version: 7, guides: [guide(1)] }), "manifest:")).toContain(
      "guides",
    );
    const many = Array.from({ length: 1001 }, (_, i) => guide(i + 1));
    expect(one(runLayers([layer(1)], { guides: many }), "manifest:")).toContain("guides");
    expect(one(runLayers([layer(1)], { guides: [guide(1), guide(1)] }), "manifest:")).toContain(
      "guides[1].id",
    );
    expect(one(runLayers([layer(1)], { guides: [guide(1, 1_000_001)] }), "manifest:")).toContain(
      "guides[0].position",
    );
  });
});

describe("validateLikeCompositor: layers", () => {
  it("checks ids, transforms and names", () => {
    expect(
      one(runLayers([layer(1), layer(2, { id: id(1), imageFile: `${id(1)}.png` })]), id8(1)),
    ).toContain("id");
    expect(one(runLayers([layer(1, { transform: transform(0, 1080) })]), id8(1))).toContain(
      "transform.size",
    );
    const far = { ...transform(), origin: [2_000_000, 0] };
    expect(one(runLayers([layer(1, { transform: far })]), id8(1))).toContain("transform.origin");
    expect(one(runLayers([layer(1, { name: " \n " })]), id8(1))).toContain("name");
    expect(one(runLayers([layer(1, { name: "é".repeat(8193) })]), id8(1))).toContain("name");
  });

  it("checks imageFile against the uppercase id", () => {
    const hex = 0xabcdef01; // an id with letters, so case matters
    const lower = layer(hex, { imageFile: `${id(hex).toLowerCase()}.png` });
    expect(one(runLayers([lower], { activeLayerID: id(hex) }), id8(hex))).toContain("imageFile");
    expect(one(runLayers([layer(1, { imageFile: "other.png" })]), id8(1))).toContain("imageFile");
  });

  it("checks masks", () => {
    const maskFile = `${id(1)}.mask.png`;
    expect(runLayers([layer(1, { maskFile, maskEnabled: true })], { version: 4 })).toEqual([]);
    expect(one(runLayers([layer(1, { maskFile: "x.mask.png" })]), id8(1))).toContain("maskFile");
    expect(one(runLayers([layer(1, { maskFile })], { version: 3 }), id8(1))).toContain("maskFile");
    const folderMask = `${id(2)}.mask.png`;
    expect(
      one(runLayers([layer(1), folder(2, { maskFile: folderMask })], { version: 5 }), id8(2)),
    ).toContain("maskFile");
    expect(one(runLayers([layer(1, { maskEnabled: true })]), id8(1))).toContain("maskEnabled");
    expect(one(runLayers([layer(1, { maskPlacement: transform() })]), id8(1))).toContain(
      "maskPlacement",
    );
    const placement = transform(0, 10);
    expect(one(runLayers([layer(1, { maskFile, maskPlacement: placement })]), id8(1))).toContain(
      "maskPlacement.size",
    );
  });

  it("checks opacity and blend mode", () => {
    expect(one(runLayers([layer(1, { opacity: 1.5 })]), id8(1))).toContain("opacity");
    expect(one(runLayers([layer(1, { opacity: -0.1 })]), id8(1))).toContain("opacity");
    expect(one(runLayers([layer(1, { opacity: 0.5 })], { version: 2 }), id8(1))).toContain(
      "opacity",
    );
    expect(one(runLayers([layer(1), folder(2, { blendMode: "Multiply" })]), id8(2))).toContain(
      "blendMode",
    );
    expect(
      one(runLayers([layer(1), folder(2, { opacity: 0.5 })], { version: 7 }), id8(2)),
    ).toContain("opacity");
    expect(runLayers([layer(1), folder(2, { opacity: 0.5 })], { version: 8 })).toEqual([]);
  });

  it("reports every failure, not only the first", () => {
    const problems = runLayers([layer(1, { opacity: 2, name: "", imageFile: "x.png" })]);
    expect(problems).toHaveLength(3);
    for (const field of ["opacity", "name", "imageFile"]) {
      expect(problems.some((p) => p.includes(id8(1)) && p.includes(field))).toBe(true);
    }
  });
});

describe("validateLikeCompositor: folders", () => {
  it("rejects an image on a folder", () => {
    expect(one(runLayers([layer(1), folder(2, { imageFile: `${id(2)}.png` })]), id8(2))).toContain(
      "imageFile",
    );
  });

  it("checks parentID", () => {
    expect(one(runLayers([layer(1, { parentID: id(9) })]), id8(1))).toContain("parentID");
    expect(one(runLayers([layer(1), layer(2, { parentID: id(1) })]), id8(2))).toContain("parentID");
    expect(one(runLayers([layer(1), folder(2, { parentID: id(2) })]), id8(2))).toContain(
      "parentID",
    );
    const cycle = runLayers([
      layer(1),
      folder(2, { parentID: id(3) }),
      folder(3, { parentID: id(2) }),
    ]);
    expect(cycle).toHaveLength(2);
    expect(cycle.every((p) => p.includes("cycle"))).toBe(true);
  });

  it("limits nesting to 64 ancestors", () => {
    // 65 nested folders: the deepest one has 64 folders above it.
    const nested = Array.from({ length: 65 }, (_, i) =>
      folder(i + 2, i === 0 ? {} : { parentID: id(i + 1) }),
    );
    expect(one(runLayers([layer(1), ...nested]), id8(66))).toContain("parentID");
  });

  it("allows no folders in version 1", () => {
    expect(one(runLayers([layer(1), folder(2)], { version: 1 }), id8(2))).toContain("isGroup");
    const problems = runLayers([layer(1), folder(2), layer(3, { parentID: id(2) })], {
      version: 1,
    });
    expect(problems.some((p) => p.includes(id8(3)) && p.includes("parentID"))).toBe(true);
  });
});

describe("validateLikeCompositor: clipping", () => {
  it("checks maskSourceID", () => {
    const clipped = layer(2, { maskSourceID: id(1) });
    expect(runLayers([layer(1), clipped])).toEqual([]);
    expect(one(runLayers([layer(1), clipped], { version: 4 }), id8(2))).toContain("maskSourceID");
    expect(one(runLayers([layer(1), layer(2, { maskSourceID: id(9) })]), id8(2))).toContain(
      "maskSourceID",
    );
    expect(
      one(runLayers([layer(1), folder(3), layer(2, { maskSourceID: id(3) })]), id8(2)),
    ).toContain("maskSourceID");
    const adjustment = { ...curvesLayer, id: id(3) };
    expect(
      one(runLayers([layer(1), adjustment, layer(2, { maskSourceID: id(3) })]), id8(2)),
    ).toContain("maskSourceID");
    expect(one(runLayers([layer(1), folder(2, { maskSourceID: id(1) })]), id8(2))).toContain(
      "maskSourceID",
    );
  });

  it("rejects cycles and chains of 256", () => {
    expect(one(runLayers([layer(1, { maskSourceID: id(1) })]), id8(1))).toContain("cycle");
    const pair = runLayers([layer(1, { maskSourceID: id(2) }), layer(2, { maskSourceID: id(1) })]);
    expect(pair).toHaveLength(2);
    const chain = Array.from({ length: 257 }, (_, i) =>
      layer(i + 1, i === 0 ? {} : { maskSourceID: id(i) }),
    );
    expect(one(runLayers(chain), id8(257))).toContain("maskSourceID");
  });
});
