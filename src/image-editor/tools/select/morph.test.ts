import { expect, it } from "vitest";
import { featherSigma, gaussianKernel, morphRef } from "./morph";

function disk(w: number, h: number, r: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2);
      if (d <= r) m[y * w + x] = 255;
    }
  return m;
}

it("expanding then contracting a square restores it", () => {
  const w = 64;
  const m = new Uint8Array(w * w);
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) m[y * w + x] = 255;
  const out = morphRef(morphRef(m, w, w, 10, "expand"), w, w, 10, "contract");
  expect(Array.from(out)).toEqual(Array.from(m));
});

it("expands a disk to within an octagon error of a true disk", () => {
  const w = 80;
  const out = morphRef(disk(w, w, 12), w, w, 10, "expand");
  let worst = 0;
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2);
      if (out[y * w + x] > 0 !== d <= 22) worst = Math.max(worst, Math.abs(d - 22));
    }
  expect(worst).toBeLessThanOrEqual(1.5); // 1 px octagon error plus pixel-center sampling
});

it("derives sigma from the radius and normalizes the kernel", () => {
  expect(featherSigma(10)).toBe(5);
  const k = gaussianKernel(5);
  expect(k).toHaveLength(31);
  expect(k.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
});
