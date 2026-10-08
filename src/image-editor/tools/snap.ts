// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerTransform.swift `TransformSnap`), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Point, Rect } from "../api";

/** The smallest move within `threshold` that puts one of `guides` on one of `targets`; 0 when none. */
function shift(guides: number[], targets: number[], threshold: number): number {
  let best: number | null = null;
  for (const guide of guides) {
    for (const target of targets) {
      const move = target - guide;
      if (Math.abs(move) > threshold) continue;
      if (best !== null && Math.abs(best) <= Math.abs(move)) continue;
      best = move;
    }
  }
  return best ?? 0;
}

/**
 * How far to move `box` so that whichever of its left, center or right lands nearest an `xs`
 * target does (within `threshold`), and the same for top, middle and bottom against `ys`; each
 * axis on its own.
 */
export function snapOffset(
  box: Rect,
  targets: { xs: number[]; ys: number[] },
  threshold: number,
): Point {
  const { x, y, width, height } = box;
  return {
    x: shift([x, x + width / 2, x + width], targets.xs, threshold),
    y: shift([y, y + height / 2, y + height], targets.ys, threshold),
  };
}
