/**
 * Adapted from opencut-classic apps/web/src/timeline/snapping/{types,build,resolve,threshold}.ts
 * @cf5e79e919144200294fb9fed22a222592a0aeea, MIT, Copyright 2025-2026 OpenCut
 */
import { type Clip, type Tracks, allTracks, clipEnd } from "./project";
import { TICKS_PER_SECOND, type Ticks } from "./time";

export type SnapPoint = {
  time: Ticks;
  type: "clip-start" | "clip-end" | "playhead";
  clipId?: string;
};

export function buildSnapPoints(
  tracks: Tracks,
  playhead: Ticks,
  exclude: ReadonlySet<string>,
): SnapPoint[] {
  const points: SnapPoint[] = [{ time: playhead, type: "playhead" }];
  for (const track of allTracks(tracks)) {
    for (const clip of track.clips as Clip[]) {
      if (exclude.has(clip.id)) continue;
      points.push({ time: clip.start, type: "clip-start", clipId: clip.id });
      points.push({ time: clipEnd(clip), type: "clip-end", clipId: clip.id });
    }
  }
  return points;
}

export function snapThreshold(pixelsPerSecond: number, thresholdPx = 10): Ticks {
  return Math.round((thresholdPx / pixelsPerSecond) * TICKS_PER_SECOND);
}

export function resolveSnap(
  target: Ticks,
  points: SnapPoint[],
  maxDistance: Ticks,
): { time: Ticks; point: SnapPoint | null } {
  let best: SnapPoint | null = null;
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = Math.abs(target - point.time);
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return { time: best ? best.time : target, point: best };
}
