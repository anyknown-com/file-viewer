import { expect, it } from "vitest";
import { resampleRef } from "./floating";

const img = (width: number, height: number, px: number[][]) => ({
  width,
  height,
  data: new Uint8Array(px.flat()),
});

it("translates by (3, 0)", () => {
  const src = img(2, 1, [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
  ]);
  const out = resampleRef(src, [1, 0, 0, 1, 3, 0], { x: 0, y: 0, width: 6, height: 1 });
  expect(Array.from(out.slice(12, 16))).toEqual([255, 0, 0, 255]);
  expect(Array.from(out.slice(16, 20))).toEqual([0, 255, 0, 255]);
  expect(out[3]).toBe(0);
});

it("rotates a 2 x 1 image into 1 x 2", () => {
  const src = img(2, 1, [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
  ]);
  const out = resampleRef(src, [0, 1, -1, 0, 1, 0], { x: 0, y: 0, width: 1, height: 2 });
  expect(Array.from(out.slice(0, 4))).toEqual([255, 0, 0, 255]);
  expect(Array.from(out.slice(4, 8))).toEqual([0, 255, 0, 255]);
});

it("keeps the colour of half-transparent pixels", () => {
  const src = img(2, 1, [
    [200, 100, 50, 128],
    [200, 100, 50, 128],
  ]);
  const out = resampleRef(src, [1, 0, 0, 1, 0.5, 0], { x: 1, y: 0, width: 1, height: 1 });
  expect(Array.from(out.slice(0, 4))).toEqual([200, 100, 50, 128]);
});
