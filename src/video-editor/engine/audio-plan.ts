import {
  clipEnd,
  type AudioClip,
  type Project,
  type Track,
  type VideoClip,
} from "../model/project";
import { type Ticks, ticksToSeconds } from "../model/time";

/** One stretch of source audio to play: `at` is on the timeline, `from` / `to` are source seconds. */
export type AudioSegment = {
  clipId: string;
  assetId: string;
  at: Ticks;
  from: number;
  to: number;
  gain: number;
};

/** Audible clips of the main track (assets in `withAudio`) and the audio tracks, cut to `[from, to)`. */
export function audioSegments(
  p: Project,
  withAudio: ReadonlySet<string>,
  from: Ticks,
  to: Ticks,
): AudioSegment[] {
  const segments: AudioSegment[] = [];
  const collect = (track: Track<VideoClip | AudioClip>) => {
    if (track.muted) return;
    for (const clip of track.clips) {
      if (clip.muted || (clip.kind === "video" && !withAudio.has(clip.assetId))) continue;
      const start = Math.max(clip.start, from);
      const end = Math.min(clipEnd(clip), to);
      if (end <= start) continue;
      segments.push({
        clipId: clip.id,
        assetId: clip.assetId,
        at: start,
        from: ticksToSeconds(start - clip.start + clip.in),
        to: ticksToSeconds(end - clip.start + clip.in),
        gain: clip.volume,
      });
    }
  };
  collect(p.tracks.main);
  for (const track of p.tracks.audio) collect(track);
  return segments;
}
