import { describe, expect, it } from "vitest";
import type { Layer, Mat2D, Point } from "../api";
import { followingTransform, layerMatrixOf, resizedTransform } from "./layer-matrix";

type Transform = Layer["transform"];

const base: Transform = {
  origin: [10, 20],
  size: [100, 50],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality",
};

function apply(m: Mat2D, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function invert(m: Mat2D): Mat2D {
  const det = m[0] * m[3] - m[1] * m[2];
  const [a, b, c, d] = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

function gap(p: Point, q: Point): number {
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
}

describe("layerMatrixOf", () => {
  it("translates and scales an unrotated layer", () => {
    const m = layerMatrixOf(base, { width: 50, height: 25 });
    expect(gap(apply(m, { x: 10, y: 20 }), { x: 0, y: 0 })).toBeLessThanOrEqual(1e-9);
    expect(gap(apply(m, { x: 110, y: 70 }), { x: 50, y: 25 })).toBeLessThanOrEqual(1e-9);
    expect(gap(apply(m, { x: 60, y: 45 }), { x: 25, y: 12.5 })).toBeLessThanOrEqual(1e-9);
  });

  it("puts pixel (0, 0) at the document's top right when turned 90°", () => {
    const t: Transform = { ...base, origin: [0, 0], size: [100, 100], rotation: 90 };
    const toDoc = invert(layerMatrixOf(t, { width: 100, height: 100 }));
    expect(gap(apply(toDoc, { x: 0, y: 0 }), { x: 100, y: 0 })).toBeLessThanOrEqual(1e-9);
  });

  it("swaps left and right with flipX", () => {
    const m = layerMatrixOf({ ...base, flipX: true }, { width: 100, height: 50 });
    expect(gap(apply(m, { x: 10, y: 20 }), { x: 100, y: 0 })).toBeLessThanOrEqual(1e-9);
    expect(gap(apply(m, { x: 110, y: 20 }), { x: 0, y: 0 })).toBeLessThanOrEqual(1e-9);
  });
});

describe("resizedTransform", () => {
  it("keeps every old pixel where it was on the document", () => {
    const t: Transform = { ...base, size: [200, 100], rotation: 30, flipX: true };
    const from = { width: 100, height: 50 };
    const to = { width: 140, height: 80 };
    const offset = { x: -20, y: -10 };
    const next = resizedTransform(t, from, to, offset);
    expect(next.rotation).toBe(30);
    expect(next.flipX).toBe(true);
    expect(next.size).toEqual([280, 160]);
    const oldToDoc = invert(layerMatrixOf(t, from));
    const newToDoc = invert(layerMatrixOf(next, to));
    for (const p of [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]) {
      const moved = apply(newToDoc, { x: p.x + offset.x, y: p.y + offset.y });
      expect(gap(moved, apply(oldToDoc, p))).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe("followingTransform", () => {
  it("carries a placement along a move exactly", () => {
    const placement: Transform = { ...base, origin: [0, 0] };
    const moved = followingTransform(placement, base, { ...base, origin: [15, 30] });
    expect(moved.origin).toEqual([5, 10]);
  });

  it("scales a placement with its layer", () => {
    const placement: Transform = { ...base, origin: [10, 20], size: [50, 25] };
    const next = followingTransform(placement, base, { ...base, size: [200, 100] });
    expect(gap({ x: next.origin[0], y: next.origin[1] }, { x: 10, y: 20 })).toBeLessThanOrEqual(
      1e-9,
    );
    expect(gap({ x: next.size[0], y: next.size[1] }, { x: 100, y: 50 })).toBeLessThanOrEqual(1e-9);
  });
});
