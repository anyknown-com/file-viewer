import { expect, it } from "vitest";
import { wandMask, type WandInput } from "./wand";

type Px = [number, number, number, number];
const RED: Px = [255, 0, 0, 255];
const BLUE: Px = [0, 0, 255, 255];

function image(w: number, h: number, color: (x: number, y: number) => Px): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(color(x, y), (y * w + x) * 4);
  return data;
}

function select(
  w: number,
  h: number,
  data: Uint8Array,
  x: number,
  y: number,
  o: Partial<WandInput> = {},
): Set<number> {
  const mask = wandMask({
    width: w,
    height: h,
    data,
    x,
    y,
    tolerance: 32,
    sample: 1,
    contiguous: true,
    ...o,
  });
  return new Set([...mask.keys()].filter((i) => mask[i] >= 128));
}

const block = (cols: [number, number], rows: [number, number], w: number): Set<number> => {
  const out = new Set<number>();
  for (let y = rows[0]; y < rows[1]; y++)
    for (let x = cols[0]; x < cols[1]; x++) out.add(y * w + x);
  return out;
};

it("stops at other colors when contiguous and finds every match when not", () => {
  const data = image(10, 4, (x) => (x < 3 || x >= 6 ? RED : BLUE));
  const left = block([0, 3], [0, 4], 10);
  const right = block([6, 10], [0, 4], 10);
  expect(select(10, 4, data, 1, 2)).toEqual(left);
  expect(select(10, 4, data, 1, 2, { contiguous: false })).toEqual(new Set([...left, ...right]));
  const banded = image(4, 3, (_, y) => (y === 0 ? RED : BLUE));
  expect(select(4, 3, banded, 1, 0)).toEqual(new Set([0, 1, 2, 3]));
  expect(select(4, 3, banded, 9, 0).size).toBe(0);
});

it("tolerance applies to every channel including alpha, and equal-to-tolerance matches", () => {
  const cols: Px[] = [
    [100, 100, 100, 255],
    [132, 100, 100, 255],
    [133, 100, 100, 255],
    [100, 100, 100, 222],
  ];
  const row = image(4, 1, (x) => cols[x]);
  const run = (tolerance: number) => select(4, 1, row, 0, 0, { tolerance, contiguous: false });
  expect(run(0)).toEqual(new Set([0]));
  expect(run(32)).toEqual(new Set([0, 1]));
  expect(run(33)).toEqual(new Set([0, 1, 2, 3]));
});

it("does not match pixels that differ only in alpha", () => {
  const row = image(2, 1, (x) => (x === 0 ? [10, 20, 30, 255] : [10, 20, 30, 0]));
  expect(select(2, 1, row, 0, 0, { tolerance: 10, contiguous: false })).toEqual(new Set([0]));
});

it("averages the sample box around the click", () => {
  const dot = image(5, 5, (x, y) => (x === 2 && y === 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  expect(select(5, 5, dot, 2, 2, { tolerance: 10, contiguous: false })).toEqual(new Set([12]));
  // The 3 x 3 average is gray 28: black is within 30 of it, the white center is not.
  const averaged = select(5, 5, dot, 2, 2, { tolerance: 30, sample: 3, contiguous: false });
  const all = new Set(Array.from({ length: 25 }, (_, i) => i));
  all.delete(12);
  expect(averaged).toEqual(all);
});

it("clamps the sample box at the image edge", () => {
  const data = image(3, 3, () => RED);
  expect(select(3, 3, data, 0, 0, { sample: 5 }).size).toBe(9);
});

it("selects a same-colored region cut off by a different color only when not contiguous", () => {
  const data = image(5, 5, (x, y) => (x === 2 || y === 2 ? BLUE : RED));
  expect(select(5, 5, data, 0, 0)).toEqual(block([0, 2], [0, 2], 5));
  expect(select(5, 5, data, 0, 0, { contiguous: false }).size).toBe(16);
});

it("leaves an anti-aliased edge without changing which pixels match", () => {
  const data = image(8, 8, (x) => (x < 4 ? RED : BLUE));
  const mask = wandMask({
    width: 8,
    height: 8,
    data,
    x: 0,
    y: 4,
    tolerance: 0,
    sample: 1,
    contiguous: true,
  });
  expect(mask[4 * 8 + 0]).toBe(255);
  expect(mask[4 * 8 + 3]).toBeGreaterThanOrEqual(128);
  expect(mask[4 * 8 + 3]).toBeLessThan(255);
  expect(mask[4 * 8 + 4]).toBeGreaterThan(0);
  expect(mask[4 * 8 + 4]).toBeLessThan(128);
  expect(mask[4 * 8 + 7]).toBe(0);
});

it("returns an empty mask for a click outside the image", () => {
  const data = image(2, 2, () => RED);
  expect(select(2, 2, data, -1, 0).size).toBe(0);
  expect(select(2, 2, data, 0, 2).size).toBe(0);
});

it("throws AbortError when the signal is already aborted", () => {
  const data = image(2, 2, () => RED);
  const c = new AbortController();
  c.abort();
  expect(() =>
    wandMask(
      { width: 2, height: 2, data, x: 0, y: 0, tolerance: 0, sample: 1, contiguous: true },
      c.signal,
    ),
  ).toThrowError(expect.objectContaining({ name: "AbortError" }));
});
