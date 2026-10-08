import { expect, it } from "vitest";
import { antsSegments } from "./ants";

function length(s: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < s.length; i += 4) sum += Math.hypot(s[i + 2] - s[i], s[i + 3] - s[i + 1]);
  return sum;
}

it("outlines a 4 x 4 block with a perimeter of 16", () => {
  const m = new Uint8Array(100);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) m[y * 10 + x] = 255;
  const s = antsSegments(m, 10, 10);
  expect(length(s)).toBe(16);
  expect(s.length / 4).toBe(4);
});

it("has no segments for an empty mask", () => {
  expect(antsSegments(new Uint8Array(100), 10, 10)).toHaveLength(0);
});
