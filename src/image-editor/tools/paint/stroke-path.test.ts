import { expect, it } from "vitest";
import type { Point } from "../../api";
import { catmullRom, createLazyRope, spacing, straightLine } from "./stroke-path";

function k(a: Point, b: Point): number {
  return Math.max(0.0001, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
}

/** Independent Barry–Goldman evaluation of the centripetal Catmull–Rom piece p1→p2 at u ∈ [0, 1]. */
function curveAt(p0: Point, p1: Point, p2: Point, p3: Point, u: number): Point {
  const t0 = 0;
  const t1 = t0 + k(p0, p1);
  const t2 = t1 + k(p1, p2);
  const t3 = t2 + k(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const lerp = (a: Point, b: Point, ta: number, tb: number): Point => {
    const wb = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * wb, y: a.y + (b.y - a.y) * wb };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  return lerp(lerp(a1, a2, t0, t2), lerp(a2, a3, t1, t3), t1, t2);
}

function distanceToPolyline(p: Point, line: Point[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

const zigzag: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 90 },
  { x: 95, y: 10 },
  { x: 130, y: 120 },
  { x: 260, y: 30 },
  { x: 300, y: 300 },
];

it("subdivides so the polyline stays within 0.2 px of the true curve", () => {
  const line = catmullRom(zigzag);
  expect(line[0]).toEqual(zigzag[0]);
  expect(line.at(-1)).toEqual(zigzag.at(-1));
  for (const p of zigzag) expect(line).toContainEqual(p);
  const last = zigzag.length - 1;
  let worst = 0;
  for (let i = 0; i < last; i++) {
    const p0 = zigzag[Math.max(0, i - 1)]!;
    const p3 = zigzag[Math.min(last, i + 2)]!;
    for (let s = 0; s <= 400; s++) {
      const q = curveAt(p0, zigzag[i]!, zigzag[i + 1]!, p3, s / 400);
      worst = Math.max(worst, distanceToPolyline(q, line));
    }
  }
  expect(worst).toBeLessThanOrEqual(0.2);
  expect(line.length).toBeGreaterThan(zigzag.length);
});

it("caps the point count at the depth limit", () => {
  const pieces = zigzag.length - 1;
  expect(catmullRom(zigzag, 0).length).toBeLessThanOrEqual(pieces * 2 ** 10 + 1);
  expect(catmullRom(zigzag, 0, 2).length).toBe(pieces * 4 + 1);
});

it("returns only the endpoints for two points", () => {
  const a = { x: 3, y: 4 };
  const b = { x: 50, y: -20 };
  expect(catmullRom([a, b])).toEqual([a, b]);
  expect(straightLine(a, b)).toEqual([a, b]);
});

it("holds the brush while the rope is slack and drags it once taut", () => {
  const rope = createLazyRope(20);
  rope.reset({ x: 0, y: 0 });
  expect(rope.push({ x: 10, y: 10 })).toBeNull();
  expect(rope.push({ x: 0, y: 20 })).toBeNull();
  const cursor = { x: 50, y: 0 };
  const moved = rope.push(cursor);
  expect(moved).not.toBeNull();
  expect(Math.hypot(cursor.x - moved!.x, cursor.y - moved!.y)).toBeCloseTo(20, 9);
  expect(moved!.y).toBeCloseTo(0, 9);
  expect(rope.push({ x: 45, y: 0 })).toBeNull();
});

it("follows the pointer exactly with no rope", () => {
  const rope = createLazyRope(0);
  rope.reset({ x: 0, y: 0 });
  expect(rope.push({ x: 0.5, y: 0 })).toEqual({ x: 0.5, y: 0 });
});

it("spaces samples at a tenth of the size, at least 1 px", () => {
  expect(spacing(1)).toBe(1);
  expect(spacing(100)).toBe(10);
});
