import { expect, it } from "vitest";
import type { Layer } from "../api";
import { makeDoc } from "../test/make-doc";
import {
  addPixelLayer,
  isPixelLayer,
  needsRasterize,
  newLayerId,
  rasterizeLayer,
} from "./commands";

const transform: Layer["transform"] = {
  origin: [0, 0],
  size: [10, 10],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality",
};

it("inserts a pixel layer above the given layer and activates it", () => {
  const doc = makeDoc({ width: 10, height: 10, layers: [{}, {}] });
  const [bottom, top] = doc.manifest.layers;
  const id = newLayerId();
  const next = addPixelLayer({ id, name: "New", above: bottom.id, transform })(doc);
  const ids = next.manifest.layers.map((l) => l.id);
  expect(ids).toEqual([bottom.id, id, top.id]);
  expect(next.manifest.layers[1].parentID).toBe(bottom.parentID);
  expect(next.manifest.activeLayerID).toBe(id);
  expect(next.pixels.get(id)?.image).toEqual({ kind: "gpu" });
});

it("puts the layer on top when above is null", () => {
  const doc = makeDoc({ width: 10, height: 10, layers: [{}, {}] });
  const id = newLayerId();
  const next = addPixelLayer({ id, name: "New", above: null, transform })(doc);
  expect(next.manifest.layers.at(-1)?.id).toBe(id);
});

it("rasterizes by dropping text and shape only", () => {
  const doc = makeDoc({
    width: 10,
    height: 10,
    layers: [{ text: { content: "hi" } as never, shape: { kind: "rect" } as never, opacity: 0.5 }],
  });
  const before = doc.manifest.layers[0];
  const after = rasterizeLayer(before.id)(doc).manifest.layers[0];
  expect(needsRasterize(before)).toBe(true);
  expect(needsRasterize(after)).toBe(false);
  expect("text" in after).toBe(false);
  expect("shape" in after).toBe(false);
  expect({ ...after, text: undefined, shape: undefined }).toEqual({
    ...before,
    text: undefined,
    shape: undefined,
  });
  expect(isPixelLayer(after)).toBe(true);
  expect(isPixelLayer({ ...after, isGroup: true })).toBe(false);
});

it("makes uppercase UUIDs", () => {
  expect(newLayerId()).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
});
