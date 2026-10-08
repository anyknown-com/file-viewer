/**
 * overlaps() adapted from opencut-classic apps/web/src/timeline/placement/overlap.ts
 * @cf5e79e919144200294fb9fed22a222592a0aeea, MIT, Copyright 2025-2026 OpenCut
 */
import {
  type AudioClip,
  type Clip,
  type ImageClip,
  MAX_AUDIO_TRACKS,
  type TextClip,
  type Track,
  type Tracks,
  type VideoClip,
  clipEnd,
  clipLength,
} from "./project";
import type { Ticks } from "./time";

export type Lane = "main" | "overlay" | "audio";

export function laneOf(clip: Clip): Lane {
  if (clip.kind === "video") return "main";
  if (clip.kind === "audio") return "audio";
  return "overlay";
}

export function overlaps(track: Track, start: Ticks, end: Ticks, excludeId?: string): boolean {
  return track.clips.some((c) => c.id !== excludeId && start < clipEnd(c) && end > c.start);
}

export function nearestFreeStart(
  track: Track,
  length: Ticks,
  desired: Ticks,
  excludeId?: string,
): Ticks {
  const target = Math.max(0, desired);
  const others = track.clips
    .filter((c) => c.id !== excludeId)
    .toSorted((a, b) => a.start - b.start);
  let best = Infinity;
  let bestDistance = Infinity;
  const consider = (gapStart: Ticks, gapEnd: Ticks) => {
    if (gapEnd - gapStart < length) return;
    const start = Math.min(Math.max(target, gapStart), gapEnd - length);
    const distance = Math.abs(start - target);
    if (distance < bestDistance || (distance === bestDistance && start < best)) {
      best = start;
      bestDistance = distance;
    }
  };
  let cursor = 0;
  for (const c of others) {
    consider(cursor, c.start);
    cursor = Math.max(cursor, clipEnd(c));
  }
  consider(cursor, Infinity);
  return best;
}

function insert<C extends Clip>(track: Track<C>, clip: C): Track<C> {
  return { ...track, clips: [...track.clips, clip].toSorted((a, b) => a.start - b.start) };
}

function newTrack<C extends Clip>(id: string, clip: C): Track<C> {
  return { id, muted: false, locked: false, clips: [clip] };
}

function placeOnTrack<C extends Clip>(track: Track<C>, clip: C): Track<C> {
  const start = nearestFreeStart(track, clipLength(clip), clip.start);
  return insert(track, { ...clip, start });
}

function placeMain(tracks: Tracks, clip: VideoClip, targetId: string | null): Tracks | null {
  const main = tracks.main;
  if (main.locked || (targetId !== null && targetId !== main.id)) return null;
  return { ...tracks, main: placeOnTrack(main, clip) };
}

function placeOverlay(
  tracks: Tracks,
  clip: ImageClip | TextClip,
  targetId: string | null,
  makeId: () => string,
): Tracks | null {
  const end = clipEnd(clip);
  const list = tracks.overlay;
  if (targetId === null) {
    const i = list.findIndex((t) => !t.locked && !overlaps(t, clip.start, end));
    if (i >= 0) return { ...tracks, overlay: list.map((t, j) => (j === i ? insert(t, clip) : t)) };
    return { ...tracks, overlay: [newTrack(makeId(), clip), ...list] };
  }
  const i = list.findIndex((t) => t.id === targetId);
  const target = list[i];
  if (!target || target.locked) return null;
  if (!overlaps(target, clip.start, end)) {
    return { ...tracks, overlay: list.map((t, j) => (j === i ? insert(t, clip) : t)) };
  }
  return { ...tracks, overlay: list.toSpliced(i, 0, newTrack(makeId(), clip)) };
}

function placeAudio(
  tracks: Tracks,
  clip: AudioClip,
  targetId: string | null,
  makeId: () => string,
): Tracks | null {
  const end = clipEnd(clip);
  const list = tracks.audio;
  const canAdd = list.length < MAX_AUDIO_TRACKS;
  const replace = (i: number, t: Track<AudioClip>) => ({
    ...tracks,
    audio: list.map((x, j) => (j === i ? t : x)),
  });
  if (targetId === null) {
    const i = list.findIndex((t) => !t.locked && !overlaps(t, clip.start, end));
    if (i >= 0) return replace(i, insert(list[i]!, clip));
    if (canAdd) return { ...tracks, audio: [...list, newTrack(makeId(), clip)] };
    const j = list.findIndex((t) => !t.locked);
    return j >= 0 ? replace(j, placeOnTrack(list[j]!, clip)) : null;
  }
  const i = list.findIndex((t) => t.id === targetId);
  const target = list[i];
  if (!target || target.locked) return null;
  if (!overlaps(target, clip.start, end)) return replace(i, insert(target, clip));
  if (canAdd) return { ...tracks, audio: list.toSpliced(i + 1, 0, newTrack(makeId(), clip)) };
  return replace(i, placeOnTrack(target, clip));
}

export function placeClip(
  tracks: Tracks,
  clip: Clip,
  targetTrackId: string | null,
  makeId: () => string,
): Tracks | null {
  if (clip.kind === "video") return placeMain(tracks, clip, targetTrackId);
  if (clip.kind === "audio") return placeAudio(tracks, clip, targetTrackId, makeId);
  return placeOverlay(tracks, clip, targetTrackId, makeId);
}

export function pruneEmpty(tracks: Tracks): Tracks {
  const overlay = tracks.overlay.filter((t) => t.clips.length > 0);
  const audio = tracks.audio.filter((t) => t.clips.length > 0);
  if (overlay.length === tracks.overlay.length && audio.length === tracks.audio.length)
    return tracks;
  return { ...tracks, overlay, audio };
}
