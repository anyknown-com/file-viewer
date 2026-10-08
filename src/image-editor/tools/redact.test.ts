import { expect, it } from "vitest";
import { blackRef, mosaicRef } from "./redact";

/** A `w` × `h` RGBA image whose every pixel has a distinct color. */
function ramp(w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++)
    out.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, 255], i * 4);
  return out;
}

const pixel = (d: Uint8Array, w: number, x: number, y: number) => [
  ...d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4),
];

it("gives every selected pixel of a cell the same color and leaves the rest byte for byte", () => {
  const w = 8;
  const h = 8;
  const data = ramp(w, h);
  const sel = new Uint8Array(w * h);
  for (let y = 0; y < 4; y++) sel.fill(255, y * w, y * w + 8);
  const out = mosaicRef(data, w, h, 4, sel);
  for (const [bx, by] of [
    [0, 0],
    [4, 0],
  ]) {
    const first = pixel(out, w, bx!, by!);
    for (let y = by!; y < by! + 4; y++)
      for (let x = bx!; x < bx! + 4; x++) expect(pixel(out, w, x, y)).toEqual(first);
  }
  expect(pixel(out, w, 0, 0)).not.toEqual(pixel(out, w, 4, 0));
  expect(out.subarray(4 * w * 4)).toEqual(data.subarray(4 * w * 4));
});

it("averages color weighted by alpha and sets the cell's average alpha", () => {
  const data = new Uint8Array([200, 0, 0, 255, 0, 0, 200, 0, 0, 0, 0, 255, 0, 0, 0, 255]);
  const out = mosaicRef(data, 2, 2, 2, new Uint8Array(4).fill(255));
  expect(pixel(out, 2, 1, 0)).toEqual([67, 0, 0, 191]);
});

it("treats a cell size of 1 as 2", () => {
  const data = ramp(4, 4);
  const sel = new Uint8Array(16).fill(255);
  expect(mosaicRef(data, 4, 4, 1, sel)).toEqual(mosaicRef(data, 4, 4, 2, sel));
});

it("turns fully selected pixels opaque black and leaves unselected ones", () => {
  const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
  const out = blackRef(data, new Uint8Array([255, 0]));
  expect([...out]).toEqual([0, 0, 0, 255, 50, 60, 70, 80]);
});
