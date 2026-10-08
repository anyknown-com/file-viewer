import { type AudioEdit, boundaries, type Range } from "./edit";
import type { View } from "./view";

/** How close (CSS pixels) a drag has to come to a boundary or the playhead to snap onto it. */
export const SNAP_PX = 8;
/** Absorbs float error so a target exactly SNAP_PX away still snaps. */
const PX_EPS = 1e-6;

export function snap(t: number, targets: number[], view: View): number {
  let best = t;
  let bestPx = SNAP_PX + PX_EPS;
  for (const target of targets) {
    const px = Math.abs(target - t) / view.secondsPerPixel;
    if (px <= bestPx) {
      best = target;
      bestPx = px;
    }
  }
  return best;
}

export function dragSelect(anchor: number, t: number, targets: number[], view: View): Range {
  const a = snap(anchor, targets, view);
  const b = snap(t, targets, view);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** Moves one edge; dragged past the other edge the two swap roles. */
export function moveHandle(
  sel: Range,
  which: "start" | "end",
  t: number,
  targets: number[],
  view: View,
): Range {
  const moved = snap(t, targets, view);
  const fixed = which === "start" ? sel.end : sel.start;
  return { start: Math.min(moved, fixed), end: Math.max(moved, fixed) };
}

/** The two segment boundaries around `t` (double click selects one segment). */
export function segmentAt(state: AudioEdit, t: number): Range {
  const b = boundaries(state);
  for (let i = 1; i < b.length; i++) {
    if (t < b[i]) return { start: b[i - 1], end: b[i] };
  }
  const last = b.length - 1;
  return { start: b[Math.max(0, last - 1)], end: b[last] };
}
