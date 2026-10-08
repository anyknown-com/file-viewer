// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/BrushStroke.swift: continuousCurve; Compositor/Document/EditorSession+Brush.swift: smoothed), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Point } from "../../api";

function knot(t: number, a: Point, b: Point): number {
  return t + Math.max(0.0001, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
}

function mix(a: Point, b: Point, ta: number, tb: number, t: number): Point {
  const wa = (tb - t) / (tb - ta);
  const wb = (t - ta) / (tb - ta);
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb };
}

/** Distance from p to the chord a–b. */
function chordError(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Subdivides start→end until every chord is within `tolerance` of the curve; pushes the chord ends after `start`. */
function piece(
  out: Point[],
  start: Point,
  end: Point,
  before: Point,
  after: Point,
  tolerance: number,
  maxDepth: number,
): void {
  const t1 = knot(0, before, start);
  const t2 = knot(t1, start, end);
  const t3 = knot(t2, end, after);
  const point = (u: number): Point => {
    if (u === 0) return start;
    if (u === 1) return end;
    const t = t1 + (t2 - t1) * u;
    const a = mix(before, start, 0, t1, t);
    const b = mix(start, end, t1, t2, t);
    const c = mix(end, after, t2, t3, t);
    return mix(mix(a, b, 0, t2, t), mix(b, c, t1, t3, t), t1, t2, t);
  };
  const subdivide = (a: Point, b: Point, lo: number, hi: number, depth: number): void => {
    const mid = (lo + hi) / 2;
    const m = point(mid);
    const deviation = Math.max(
      chordError(a, b, m),
      chordError(a, b, point((lo + mid) / 2)),
      chordError(a, b, point((mid + hi) / 2)),
    );
    if (deviation <= tolerance || depth >= maxDepth) {
      out.push(b);
      return;
    }
    subdivide(a, m, lo, mid, depth + 1);
    subdivide(m, b, mid, hi, depth + 1);
  };
  subdivide(start, end, 0, 1, 0);
}

/** Centripetal Catmull–Rom through every point, as a polyline whose chords stay within `tolerance` of the curve. */
export function catmullRom(points: Point[], tolerance = 0.2, maxDepth = 10): Point[] {
  if (points.length < 2) return points.slice();
  const out: Point[] = [points[0]!];
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(last, i + 2)]!;
    piece(out, points[i]!, points[i + 1]!, before, after, tolerance, maxDepth);
  }
  return out;
}

/**
 * Smoothing: the brush trails the pointer on a rope of `length` px and moves only once the
 * pointer pulls it taut. `push` returns null while the rope is slack.
 */
export function createLazyRope(length: number): {
  push(p: Point): Point | null;
  reset(p: Point): void;
} {
  let anchor: Point | null = null;
  return {
    push(p) {
      if (!anchor || length <= 0) {
        anchor = p;
        return p;
      }
      const dx = p.x - anchor.x;
      const dy = p.y - anchor.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= length) return null;
      const step = (distance - length) / distance;
      anchor = { x: anchor.x + dx * step, y: anchor.y + dy * step };
      return anchor;
    },
    reset(p) {
      anchor = p;
    },
  };
}

/** Shift-click: a straight line from the previous stroke's end. */
export function straightLine(a: Point, b: Point): Point[] {
  return [a, b];
}

/** Distance between samples taken along the path. */
export function spacing(size: number): number {
  return Math.max(1, size * 0.1);
}
