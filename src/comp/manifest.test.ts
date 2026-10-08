// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ProjectError } from "./errors";
import { parseManifest, stringifyManifest } from "./manifest";

const LAYER_ID = "6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F";

// The minimal manifest from Compositor docs/writing-comp-files.md @11d8d7a.
function minimal(): Record<string, unknown> {
  return {
    format: "com.compositor.project",
    version: 11,
    colorSpace: "sRGB",
    documentID: "0C5E7A91-3B2D-4F6A-8E1C-9D0B7A6F5E4D",
    width: 1920,
    height: 1080,
    resolution: 72,
    activeLayerID: LAYER_ID,
    layers: [
      {
        id: LAYER_ID,
        name: "Background",
        imageFile: `${LAYER_ID}.png`,
        isVisible: true,
        isGroup: false,
        opacity: 1,
        blendMode: "Normal",
        transform: {
          origin: [0, 0],
          size: [1920, 1080],
          rotation: 0,
          flipX: false,
          flipY: false,
          sampling: "High quality",
        },
      },
    ],
  };
}

type Json = Record<string, unknown>;

function layer0(m: Json): Json {
  return (m.layers as Json[])[0] as Json;
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function parseError(input: Uint8Array): ProjectError {
  try {
    parseManifest(input);
  } catch (error) {
    if (error instanceof ProjectError) return error;
    throw error;
  }
  throw new Error("parseManifest did not throw");
}

function roundTrip(m: Json): Json {
  return JSON.parse(stringifyManifest(parseManifest(bytes(m)))) as Json;
}

const identityRange = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };
const identityCurve = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

function curvesAdjustment(): Json {
  return {
    kind: "Curves",
    hue: 0,
    saturation: 0,
    lightness: 0,
    colorize: false,
    levels: {
      channel: "RGB",
      ranges: [identityRange, identityRange, identityRange, identityRange],
    },
    curves: {
      channel: "RGB",
      channels: [identityCurve, identityCurve, identityCurve, identityCurve],
    },
  };
}

// Every object (by path) whose keys are not in JS default sort order.
function unsortedObjects(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => unsortedObjects(v, `${path}[${i}]`));
  if (typeof value !== "object" || value === null) return [];
  const keys = Object.keys(value);
  const sorted = [...keys];
  sorted.sort(); // toSorted is ES2023; ./comp targets ES2022
  const own = keys.join() === sorted.join() ? [] : [path];
  return own.concat(Object.entries(value).flatMap(([k, v]) => unsortedObjects(v, `${path}.${k}`)));
}

describe("parseManifest / stringifyManifest", () => {
  it("reads the minimal manifest and survives a round trip", () => {
    const first = parseManifest(bytes(minimal()));
    expect(first.layers[0]?.name).toBe("Background");
    const again = parseManifest(new TextEncoder().encode(stringifyManifest(first)));
    expect(again).toEqual(first);
    expect(roundTrip(minimal())).toEqual(minimal());
  });

  it("keeps unknown keys at every level", () => {
    const m = minimal();
    m.futureTop = { a: 1 };
    const layer = layer0(m);
    layer.futureLayer = [1, 2];
    (layer.transform as Json).futureTransform = "x";
    layer.adjustment = { ...curvesAdjustment(), futureAdjust: true };
    delete layer.imageFile;
    const out = roundTrip(m);
    expect(out.futureTop).toEqual({ a: 1 });
    const outLayer = layer0(out);
    expect(outLayer.futureLayer).toEqual([1, 2]);
    expect((outLayer.transform as Json).futureTransform).toBe("x");
    expect((outLayer.adjustment as Json).futureAdjust).toBe(true);
    expect(out).toEqual(m);
  });

  it("rejects a newer version as too_new", () => {
    const m = minimal();
    m.version = 12;
    const error = parseError(bytes(m));
    expect(error.code).toBe("too_new");
    expect(error.details).toEqual(["saved by a newer Compositor (version 12)"]);
  });

  it("rejects another format as not_project", () => {
    const m = minimal();
    m.format = "x";
    expect(parseError(bytes(m)).code).toBe("not_project");
  });

  it("rejects bytes that are not UTF-8 or not JSON as invalid", () => {
    expect(parseError(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])).code).toBe("invalid");
    expect(parseError(new TextEncoder().encode('{"format": ')).code).toBe("invalid");
    expect(parseError(new TextEncoder().encode("[]")).code).toBe("invalid");
  });

  it("reports the path of a missing required field", () => {
    const m = minimal();
    delete (layer0(m).transform as Json).sampling;
    const error = parseError(bytes(m));
    expect(error.code).toBe("invalid");
    expect(error.details.some((d) => d.startsWith("layers.0.transform.sampling:"))).toBe(true);
  });

  it("writes sorted keys, two-space indent, uppercase ids and version 11", () => {
    const m = minimal();
    m.version = 3;
    m.documentID = (m.documentID as string).toLowerCase();
    layer0(m).id = LAYER_ID.toLowerCase();
    m.activeLayerID = LAYER_ID.toLowerCase();
    const text = stringifyManifest(parseManifest(bytes(m)));
    expect(text.endsWith("\n")).toBe(false);
    expect(text.split("\n")[1]).toBe('  "activeLayerID": "6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F",');
    const out = JSON.parse(text) as Json;
    expect(out.version).toBe(11);
    expect(out.documentID).toBe("0C5E7A91-3B2D-4F6A-8E1C-9D0B7A6F5E4D");
    expect(layer0(out).id).toBe(LAYER_ID);
    expect(unsortedObjects(out)).toEqual([]);
  });

  it("fills isGroup, opacity and blendMode like Compositor's save", () => {
    const m = minimal();
    const layer = layer0(m);
    delete layer.isGroup;
    delete layer.opacity;
    delete layer.blendMode;
    const outLayer = layer0(roundTrip(m));
    expect(outLayer.isGroup).toBe(false);
    expect(outLayer.opacity).toBe(1);
    expect(outLayer.blendMode).toBe("Normal");
  });

  it("reads null in optional fields as absent and leaves them out", () => {
    const m = minimal();
    m.guides = null;
    layer0(m).parentID = null;
    const out = roundTrip(m);
    expect("guides" in out).toBe(false);
    expect("parentID" in layer0(out)).toBe(false);
  });

  it("returns layers in tree order", () => {
    const folder = "11111111-1111-4111-8111-111111111111";
    const m = minimal();
    const base = layer0(m);
    m.layers = [
      { ...base, id: folder, name: "Folder", isGroup: true, imageFile: undefined },
      base,
      { ...base, id: "22222222-2222-4222-8222-222222222222", name: "Child", parentID: folder },
    ];
    const parsed = parseManifest(bytes(m));
    expect(parsed.layers.map((l) => l.name)).toEqual(["Folder", "Child", "Background"]);
  });
});
