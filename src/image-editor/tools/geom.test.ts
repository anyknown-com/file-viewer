import { expect, it } from "vitest";
import type { EditorApi, Layer, Mat2D, Size } from "../api";
import { apply, docRectToLayer, invert, layerPixelSize, multiply } from "./geom";

function fakeApi(layer: Partial<Layer>, px: Record<string, Size | null>): EditorApi {
  const full = {
    id: "L",
    transform: { origin: [0, 0], size: [10.4, 20.6], rotation: 0 },
    ...layer,
  };
  return {
    doc: () => ({ manifest: { layers: [full] } }),
    pixelSize: (_id: string, target: string) => px[target] ?? null,
    layerMatrix: () => [1, 0, 0, 1, -5, -7] as Mat2D,
  } as unknown as EditorApi;
}

it("multiplies a matrix by its inverse to the identity", () => {
  const m: Mat2D = [2, 1, -1, 3, 5, 7];
  const id = multiply(m, invert(m));
  [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(id[i]).toBeCloseTo(v));
  expect(apply(m, { x: 1, y: 1 })).toEqual({ x: 6, y: 11 });
});

it("takes the layer size from the texture when there is one", () => {
  expect(layerPixelSize(fakeApi({}, { image: { width: 30, height: 20 } }), "L")).toEqual({
    width: 30,
    height: 20,
  });
});

it("falls back to the rounded transform size", () => {
  expect(layerPixelSize(fakeApi({}, {}), "L")).toEqual({ width: 10, height: 21 });
});

it("uses maskPlacement for a mask without a texture", () => {
  const api = fakeApi({ maskPlacement: { size: [4.2, 8.8] } as Layer["transform"] }, {});
  expect(layerPixelSize(api, "L", "mask")).toEqual({ width: 4, height: 9 });
});

it("maps a document rectangle by translation only", () => {
  const r = docRectToLayer(fakeApi({}, {}), "L", { x: 10, y: 10, width: 4, height: 4 });
  expect(r).toEqual({ x: 5, y: 3, width: 4, height: 4 });
});
