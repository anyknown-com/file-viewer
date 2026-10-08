import { type Clip, clipEnd, clipLength } from "../../model/project";
import { type SnapPoint, resolveSnap, snapThreshold } from "../../model/snapping";
import { TICKS_PER_SECOND, type Ticks } from "../../model/time";

export function ticksToPx(t: Ticks, pps: number): number {
  return (t / TICKS_PER_SECOND) * pps;
}

export function pxToTicks(px: number, pps: number): Ticks {
  return Math.round((px / pps) * TICKS_PER_SECOND);
}

/** Moves a clip by `dxPx`; whichever of its two edges lands nearer a snap point wins. */
export function dragMove(o: {
  clip: Clip;
  dxPx: number;
  pps: number;
  points: SnapPoint[];
  playhead: Ticks;
}): { start: Ticks; snapLine: Ticks | null } {
  const points: SnapPoint[] = [...o.points, { time: o.playhead, type: "playhead" }];
  const max = snapThreshold(o.pps);
  const length = clipLength(o.clip);
  const raw = Math.max(0, o.clip.start + pxToTicks(o.dxPx, o.pps));
  const head = resolveSnap(raw, points, max);
  const tail = resolveSnap(raw + length, points, max);
  const headDistance = head.point ? Math.abs(head.time - raw) : Infinity;
  const tailDistance = tail.point ? Math.abs(tail.time - (raw + length)) : Infinity;
  if (headDistance === Infinity && tailDistance === Infinity) return { start: raw, snapLine: null };
  if (headDistance <= tailDistance) return { start: head.time, snapLine: head.time };
  return { start: Math.max(0, tail.time - length), snapLine: tail.time };
}

/** Drags one edge of a clip by `dxPx`, snapping that edge. */
export function dragTrim(o: {
  clip: Clip;
  edge: "start" | "end";
  dxPx: number;
  pps: number;
  points: SnapPoint[];
}): { to: Ticks; snapLine: Ticks | null } {
  const from = o.edge === "start" ? o.clip.start : clipEnd(o.clip);
  const raw = Math.max(0, from + pxToTicks(o.dxPx, o.pps));
  const snap = resolveSnap(raw, o.points, snapThreshold(o.pps));
  return { to: snap.time, snapLine: snap.point ? snap.time : null };
}
