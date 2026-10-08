import { expect, it } from "vitest";
import { eraseOver, paintMask, paintOver } from "./composite";

const base = new Uint8Array([10, 20, 30, 255, 200, 100, 50, 128]);

it("leaves pixels alone where coverage is 0", () => {
  const zero = new Uint8Array(2);
  expect(paintOver(base, zero, [255, 0, 0, 255], 1)).toEqual(base);
  expect(eraseOver(base, zero, 1)).toEqual(base);
  expect(paintMask(new Uint8Array([7, 9]), zero, 255, 1)).toEqual(new Uint8Array([7, 9]));
});

it("paints the color itself at full coverage and opacity", () => {
  const out = paintOver(base, new Uint8Array([255, 255]), [40, 80, 160, 255], 1);
  expect(out).toEqual(new Uint8Array([40, 80, 160, 255, 40, 80, 160, 255]));
});

it("composites source-over onto a translucent base", () => {
  // sa = 0.5, da = 128/255: oa = 0.5 + da × 0.5.
  const out = paintOver(
    new Uint8Array([0, 0, 255, 128]),
    new Uint8Array([255]),
    [255, 0, 0, 255],
    0.5,
  );
  const da = 128 / 255;
  const oa = 0.5 + da * 0.5;
  expect(out[3]).toBe(Math.round(oa * 255));
  expect(out[0]).toBe(Math.round((255 * 0.5) / oa));
  expect(out[2]).toBe(Math.round((255 * da * 0.5) / oa));
});

it("erases alpha to 0 at full coverage", () => {
  const out = eraseOver(base, new Uint8Array([255, 255]), 1);
  expect(out[3]).toBe(0);
  expect(out[7]).toBe(0);
  expect(out[0]).toBe(10);
  expect(eraseOver(base, new Uint8Array([255, 0]), 0.5)[3]).toBe(128);
});

it("rounds mask values", () => {
  // 100 + (255 − 100) × 0.5 = 177.5 → 178; 100 + (0 − 100) × 0.25 = 75.
  expect(paintMask(new Uint8Array([100]), new Uint8Array([255]), 255, 0.5)).toEqual(
    new Uint8Array([178]),
  );
  expect(paintMask(new Uint8Array([100]), new Uint8Array([255]), 0, 0.25)).toEqual(
    new Uint8Array([75]),
  );
});
