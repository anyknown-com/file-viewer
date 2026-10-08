// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/Curves.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { AdjustmentSettings } from "../api";

type Point = { x: number; y: number };

const DIAGONAL: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

/**
 * `CurvesSettings.value`: shape-preserving cubic Hermite through `points` (x ascending, 0–255),
 * so the curve never overshoots between handles. x and the result are 0–255.
 */
export function curveSample(points: readonly Point[], x: number): number {
  const p = points.length >= 2 ? points : DIAGONAL;
  const at = (j: number): Point => p[j] ?? { x: 0, y: 0 };
  let last = -1;
  for (let j = 0; j < p.length; j++) if (at(j).x <= x) last = j;
  const i = Math.min(p.length - 2, Math.max(0, last));
  const d: number[] = [];
  for (let j = 0; j < p.length - 1; j++) d.push((at(j + 1).y - at(j).y) / (at(j + 1).x - at(j).x));
  const dAt = (j: number): number => d[j] ?? 0;
  const slope = (j: number): number => {
    if (j === 0) return dAt(0);
    if (j === p.length - 1) return dAt(d.length - 1);
    if (dAt(j - 1) * dAt(j) <= 0) return 0;
    return 2 / (1 / dAt(j - 1) + 1 / dAt(j));
  };
  const h = at(i + 1).x - at(i).x;
  const t = Math.min(1, Math.max(0, (x - at(i).x) / h));
  const t2 = t * t;
  const t3 = t2 * t;
  const y =
    (2 * t3 - 3 * t2 + 1) * at(i).y +
    (t3 - 2 * t2 + t) * h * slope(i) +
    (-2 * t3 + 3 * t2) * at(i + 1).y +
    (t3 - t2) * h * slope(i + 1);
  return Math.min(255, Math.max(0, y));
}

/** Same layout as `levelsLut`: each channel's own curve first, then the composite RGB curve. */
export function curvesLut(s: AdjustmentSettings): Float32Array {
  const channels = s.curves.channels;
  const master = channels[0] ?? DIAGONAL;
  const lut = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    for (let c = 0; c < 3; c++) {
      lut[i * 4 + c] = curveSample(master, curveSample(channels[c + 1] ?? DIAGONAL, i)) / 255;
    }
    lut[i * 4 + 3] = 1;
  }
  return lut;
}
