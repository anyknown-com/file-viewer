/**
 * Adapted from opencut-classic apps/web/src/commands/timeline/element/split-elements.ts (trim split)
 * @cf5e79e919144200294fb9fed22a222592a0aeea, MIT, Copyright 2025-2026 OpenCut
 */
import { type Clip, type Track, type Tracks, clipEnd } from "./project";
import type { Ticks } from "./time";

export function splitClip<C extends Clip>(clip: C, at: Ticks, rightId: string): [C, C] | null {
  if (at <= clip.start || at >= clipEnd(clip)) return null;
  if (clip.kind === "video" || clip.kind === "audio") {
    const mid = clip.in + (at - clip.start);
    const left = { ...clip, out: mid };
    const right = { ...clip, id: rightId, start: at, in: mid };
    return [left as C, right as C];
  }
  const leftLength = at - clip.start;
  const left = { ...clip, duration: leftLength };
  const right = { ...clip, id: rightId, start: at, duration: clip.duration - leftLength };
  return [left as C, right as C];
}

export function splitTracks(
  tracks: Tracks,
  at: Ticks,
  selected: ReadonlySet<string>,
  makeId: () => string,
): Tracks {
  const splitTrack = <C extends Clip>(track: Track<C>): Track<C> => {
    if (track.locked) return track;
    let changed = false;
    const clips: C[] = [];
    for (const clip of track.clips) {
      const pair =
        selected.size === 0 || selected.has(clip.id) ? splitClip(clip, at, makeId()) : null;
      if (pair) {
        clips.push(pair[0], pair[1]);
        changed = true;
      } else {
        clips.push(clip);
      }
    }
    return changed ? { ...track, clips } : track;
  };
  return {
    overlay: tracks.overlay.map(splitTrack),
    main: splitTrack(tracks.main),
    audio: tracks.audio.map(splitTrack),
  };
}
