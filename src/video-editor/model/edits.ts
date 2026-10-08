import { type Command, settingsCommand, tracksCommand } from "./commands";
import { newId } from "./ids";
import { pruneEmpty, placeClip } from "./placement";
import {
  type Aspect,
  type AssetMeta,
  type Clip,
  type Fit,
  type Project,
  type Track,
  type Tracks,
  canvasSize,
  clipEnd,
  findClip,
} from "./project";
import { removeClips } from "./ripple";
import { splitTracks } from "./split";
import { type Ticks, TICKS_PER_SECOND, frameTicks, roundToFrame } from "./time";

export type ClipPatch = Partial<{
  volume: number;
  muted: boolean;
  fit: Fit;
  text: string;
  size: number;
  color: string;
  background: boolean;
  x: number;
  y: number;
  width: number;
}>;

const IMAGE_DURATION = 5 * TICKS_PER_SECOND;
const TEXT_DURATION = 3 * TICKS_PER_SECOND;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function commit(p: Project, label: string, after: Tracks): Command | null {
  const next = pruneEmpty(after);
  if (next === p.tracks || JSON.stringify(next) === JSON.stringify(p.tracks)) return null;
  return tracksCommand(label, p.tracks, next);
}

function mapClip(tracks: Tracks, clipId: string, fn: (c: Clip) => Clip): Tracks {
  const onTrack = <T extends Track>(t: T): T =>
    t.clips.some((c) => c.id === clipId)
      ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? fn(c) : c)) }
      : t;
  return {
    overlay: tracks.overlay.map(onTrack),
    main: onTrack(tracks.main),
    audio: tracks.audio.map(onTrack),
  } as Tracks;
}

export function addAsset(
  p: Project,
  asset: AssetMeta,
  at: Ticks,
  targetTrackId: string | null,
): Command | null {
  const start = roundToFrame(at, p.fps);
  const id = newId();
  const length = asset.kind === "image" ? IMAGE_DURATION : (asset.duration ?? 0);
  if (length <= 0) return null;
  const clip: Clip =
    asset.kind === "video"
      ? {
          id,
          kind: "video",
          assetId: asset.id,
          start,
          in: 0,
          out: length,
          volume: 1,
          muted: false,
          fit: "fit",
        }
      : asset.kind === "audio"
        ? {
            id,
            kind: "audio",
            assetId: asset.id,
            start,
            in: 0,
            out: length,
            volume: 1,
            muted: false,
          }
        : {
            id,
            kind: "image",
            assetId: asset.id,
            start,
            duration: length,
            x: 0.5,
            y: 0.5,
            width: 0.3,
          };
  const after = placeClip(p.tracks, clip, targetTrackId, newId);
  return after && commit(p, "Add asset", after);
}

export function addText(p: Project, at: Ticks, text: string): Command | null {
  const clip: Clip = {
    id: newId(),
    kind: "text",
    start: roundToFrame(at, p.fps),
    duration: TEXT_DURATION,
    text,
    size: 0.08,
    color: "#ffffff",
    background: false,
    x: 0.5,
    y: 0.85,
  };
  const after = placeClip(p.tracks, clip, null, newId);
  return after && commit(p, "Add text", after);
}

export function moveClip(
  p: Project,
  clipId: string,
  targetTrackId: string,
  start: Ticks,
): Command | null {
  const found = findClip(p.tracks, clipId);
  if (!found || found.track.locked) return null;
  const removeFrom = <T extends Track>(t: T): T =>
    t.id === found.track.id ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t;
  const without = {
    overlay: p.tracks.overlay.map(removeFrom),
    main: removeFrom(p.tracks.main),
    audio: p.tracks.audio.map(removeFrom),
  } as Tracks;
  const moved = { ...found.clip, start: Math.max(0, roundToFrame(start, p.fps)) };
  const after = placeClip(without, moved, targetTrackId, newId);
  return after && commit(p, "Move clip", after);
}

export function trimClip(
  p: Project,
  clipId: string,
  edge: "start" | "end",
  to: Ticks,
  assetDuration: Ticks | null,
): Command | null {
  const found = findClip(p.tracks, clipId);
  if (!found || found.track.locked) return null;
  const { clip, track } = found;
  const min = frameTicks(p.fps);
  const t = roundToFrame(to, p.fps);
  const end = clipEnd(clip);
  const others = track.clips.filter((c) => c.id !== clipId);
  const prevEnd = Math.max(0, ...others.filter((c) => c.start < clip.start).map(clipEnd));
  const nextStart = Math.min(
    Infinity,
    ...others.filter((c) => c.start > clip.start).map((c) => c.start),
  );
  const timed = clip.kind === "video" || clip.kind === "audio";
  if (edge === "start") {
    const lower = timed ? Math.max(prevEnd, clip.start - clip.in) : prevEnd;
    const s = clamp(t, lower, end - min);
    return commit(
      p,
      "Trim clip",
      mapClip(p.tracks, clipId, (c) =>
        c.kind === "video" || c.kind === "audio"
          ? { ...c, start: s, in: c.in + (s - c.start) }
          : { ...c, start: s, duration: end - s },
      ),
    );
  }
  const sourceLimit =
    timed && assetDuration !== null ? clip.start + (assetDuration - clip.in) : Infinity;
  const e = clamp(t, clip.start + min, Math.min(nextStart, sourceLimit));
  return commit(
    p,
    "Trim clip",
    mapClip(p.tracks, clipId, (c) =>
      c.kind === "video" || c.kind === "audio"
        ? { ...c, out: c.in + (e - c.start) }
        : { ...c, duration: e - c.start },
    ),
  );
}

export function splitAt(p: Project, at: Ticks, selected: ReadonlySet<string>): Command | null {
  return commit(p, "Split", splitTracks(p.tracks, roundToFrame(at, p.fps), selected, newId));
}

export function deleteClips(p: Project, ids: ReadonlySet<string>, ripple: boolean): Command | null {
  return commit(p, "Delete", removeClips(p.tracks, ids, ripple));
}

function patchClip(c: Clip, patch: ClipPatch): Clip {
  const { volume, muted, fit, text, size, color, background, x, y, width } = patch;
  const pos = {
    ...(x !== undefined && { x: clamp(x, 0, 1) }),
    ...(y !== undefined && { y: clamp(y, 0, 1) }),
  };
  switch (c.kind) {
    case "video":
      return {
        ...c,
        ...(volume !== undefined && { volume: clamp(volume, 0, 2) }),
        ...(muted !== undefined && { muted }),
        ...(fit !== undefined && { fit }),
      };
    case "audio":
      return {
        ...c,
        ...(volume !== undefined && { volume: clamp(volume, 0, 2) }),
        ...(muted !== undefined && { muted }),
      };
    case "image":
      return { ...c, ...pos, ...(width !== undefined && { width: clamp(width, 0, 1) }) };
    case "text":
      return {
        ...c,
        ...pos,
        ...(text !== undefined && { text }),
        ...(size !== undefined && { size: clamp(size, 0.02, 0.3) }),
        ...(color !== undefined && { color }),
        ...(background !== undefined && { background }),
      };
  }
}

export function updateClip(p: Project, clipId: string, patch: ClipPatch): Command | null {
  const found = findClip(p.tracks, clipId);
  if (!found || found.track.locked) return null;
  return commit(
    p,
    "Edit clip",
    mapClip(p.tracks, clipId, (c) => patchClip(c, patch)),
  );
}

export function setTrackFlag(
  p: Project,
  trackId: string,
  flag: "muted" | "locked",
  value: boolean,
): Command | null {
  const onTrack = <T extends Track>(t: T): T => (t.id === trackId ? { ...t, [flag]: value } : t);
  const after = {
    overlay: p.tracks.overlay.map(onTrack),
    main: onTrack(p.tracks.main),
    audio: p.tracks.audio.map(onTrack),
  } as Tracks;
  return commit(p, flag === "muted" ? "Mute track" : "Lock track", after);
}

export function setAspect(p: Project, aspect: Aspect): Command | null {
  const size = canvasSize(aspect, p.source);
  if (aspect === p.aspect && size.width === p.width && size.height === p.height) return null;
  return settingsCommand(
    "Change aspect",
    { aspect: p.aspect, width: p.width, height: p.height },
    { aspect, ...size },
  );
}
