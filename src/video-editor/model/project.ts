import { newId } from "./ids";
import type { Ticks } from "./time";

export const SOURCE_ASSET_ID = "source";
export const MAX_AUDIO_TRACKS = 3;

export type AssetKind = "video" | "audio" | "image";
export type AssetMeta = {
  id: string;
  name: string;
  kind: AssetKind;
  duration: Ticks | null;
  width: number;
  height: number;
  fps: number | null;
  hasAudio: boolean;
};
export type Aspect = "source" | "16:9" | "9:16" | "1:1";
export type Fit = "fit" | "fill";

export type VideoClip = {
  id: string;
  kind: "video";
  assetId: string;
  start: Ticks;
  in: Ticks;
  out: Ticks;
  volume: number;
  muted: boolean;
  fit: Fit;
};
export type AudioClip = {
  id: string;
  kind: "audio";
  assetId: string;
  start: Ticks;
  in: Ticks;
  out: Ticks;
  volume: number;
  muted: boolean;
};
export type ImageClip = {
  id: string;
  kind: "image";
  assetId: string;
  start: Ticks;
  duration: Ticks;
  x: number;
  y: number;
  width: number;
};
export type TextClip = {
  id: string;
  kind: "text";
  start: Ticks;
  duration: Ticks;
  text: string;
  size: number;
  color: string;
  background: boolean;
  x: number;
  y: number;
};
export type Clip = VideoClip | AudioClip | ImageClip | TextClip;

export type Track<C extends Clip = Clip> = {
  id: string;
  muted: boolean;
  locked: boolean;
  clips: C[];
};
export type Tracks = {
  overlay: Track<ImageClip | TextClip>[];
  main: Track<VideoClip>;
  audio: Track<AudioClip>[];
};
export type Project = {
  width: number;
  height: number;
  fps: number;
  aspect: Aspect;
  source: { width: number; height: number };
  tracks: Tracks;
};

export function clipLength(clip: Clip): Ticks {
  return clip.kind === "video" || clip.kind === "audio" ? clip.out - clip.in : clip.duration;
}

export function clipEnd(clip: Clip): Ticks {
  return clip.start + clipLength(clip);
}

export function allTracks(tracks: Tracks): Track[] {
  return [...tracks.overlay, tracks.main, ...tracks.audio];
}

export function findClip(tracks: Tracks, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of allTracks(tracks)) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function projectDuration(p: Project): Ticks {
  let end = 0;
  for (const track of allTracks(p.tracks)) {
    for (const clip of track.clips) end = Math.max(end, clipEnd(clip));
  }
  return end;
}

const even = (n: number) => Math.round(n / 2) * 2;

export function canvasSize(
  aspect: Aspect,
  source: { width: number; height: number },
): { width: number; height: number } {
  if (aspect === "source") return { width: source.width, height: source.height };
  const b = Math.min(source.width, source.height);
  const long = (b * 16) / 9;
  if (aspect === "16:9") return { width: even(long), height: even(b) };
  if (aspect === "9:16") return { width: even(b), height: even(long) };
  return { width: even(b), height: even(b) };
}

export function createProject(source: AssetMeta): Project {
  const size = { width: source.width, height: source.height };
  return {
    ...size,
    fps: Math.min(Math.round(source.fps ?? 30), 60),
    aspect: "source",
    source: size,
    tracks: {
      overlay: [],
      main: {
        id: newId(),
        muted: false,
        locked: false,
        clips: [
          {
            id: newId(),
            kind: "video",
            assetId: SOURCE_ASSET_ID,
            start: 0,
            in: 0,
            out: source.duration ?? 0,
            volume: 1,
            muted: false,
            fit: "fit",
          },
        ],
      },
      audio: [],
    },
  };
}
