/**
 * Adapted from opencut-classic apps/web/src/ripple/{apply,shift}.ts
 * @cf5e79e919144200294fb9fed22a222592a0aeea, MIT, Copyright 2025-2026 OpenCut
 */
import { type Clip, type Track, type Tracks, clipEnd, clipLength } from "./project";
import type { Ticks } from "./time";

export type RippleAdjustment = { trackId: string; afterTime: Ticks; shift: Ticks };

export function applyRipple(tracks: Tracks, adjustments: RippleAdjustment[]): Tracks {
  if (adjustments.length === 0) return tracks;
  const shiftTrack = <C extends Clip>(track: Track<C>): Track<C> => {
    const own = adjustments
      .filter((a) => a.trackId === track.id)
      .toSorted((a, b) => b.afterTime - a.afterTime);
    if (own.length === 0) return track;
    let clips = track.clips;
    for (const { afterTime, shift } of own) {
      clips = clips.map((c) => (c.start >= afterTime ? { ...c, start: c.start - shift } : c));
    }
    return { ...track, clips };
  };
  return {
    overlay: tracks.overlay.map(shiftTrack),
    main: shiftTrack(tracks.main),
    audio: tracks.audio.map(shiftTrack),
  };
}

export function removeClips(tracks: Tracks, ids: ReadonlySet<string>, ripple: boolean): Tracks {
  const adjustments: RippleAdjustment[] = [];
  const removeFrom = <C extends Clip>(track: Track<C>): Track<C> => {
    if (track.locked) return track;
    const kept = track.clips.filter((c) => !ids.has(c.id));
    if (kept.length === track.clips.length) return track;
    if (ripple) {
      for (const c of track.clips) {
        if (ids.has(c.id)) {
          adjustments.push({ trackId: track.id, afterTime: clipEnd(c), shift: clipLength(c) });
        }
      }
    }
    return { ...track, clips: kept };
  };
  const removed: Tracks = {
    overlay: tracks.overlay.map(removeFrom),
    main: removeFrom(tracks.main),
    audio: tracks.audio.map(removeFrom),
  };
  return applyRipple(removed, adjustments);
}
