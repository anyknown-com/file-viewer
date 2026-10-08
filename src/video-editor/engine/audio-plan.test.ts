import { describe, expect, it } from "vitest";
import type { AudioClip, Project, VideoClip } from "../model/project";
import { TICKS_PER_SECOND } from "../model/time";
import { audioSegments } from "./audio-plan";

const S = TICKS_PER_SECOND;

const video = (id: string, start: number, o: Partial<VideoClip> = {}): VideoClip => ({
  id,
  kind: "video",
  assetId: id,
  start: start * S,
  in: 0,
  out: 2 * S,
  volume: 1,
  muted: false,
  fit: "fit",
  ...o,
});
const audio = (id: string, start: number, o: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: "audio",
  assetId: id,
  start: start * S,
  in: 0,
  out: 2 * S,
  volume: 1,
  muted: false,
  ...o,
});

function project(main: VideoClip[], audioTracks: AudioClip[][], mutedTrack?: number): Project {
  return {
    width: 320,
    height: 180,
    fps: 30,
    aspect: "source",
    source: { width: 320, height: 180 },
    tracks: {
      main: { id: "main", muted: mutedTrack === -1, locked: false, clips: main },
      overlay: [],
      audio: audioTracks.map((clips, i) => ({
        id: `a${i}`,
        muted: i === mutedTrack,
        locked: false,
        clips,
      })),
    },
  };
}

const all = new Set(["v1", "v2"]);

describe("audioSegments", () => {
  it("skips muted clips and muted tracks", () => {
    const p = project([video("v1", 0), video("v2", 2, { muted: true })], [[audio("a1", 0)]], 0);
    expect(audioSegments(p, all, 0, 4 * S).map((s) => s.clipId)).toEqual(["v1"]);
    const mainMuted = project([video("v1", 0)], [[audio("a1", 0)]], -1);
    expect(audioSegments(mainMuted, all, 0, 4 * S).map((s) => s.clipId)).toEqual(["a1"]);
  });

  it("cuts clips that cross the range edges", () => {
    const p = project([video("v1", 0, { in: S, out: 3 * S })], [[audio("a1", 1.5)]]);
    expect(audioSegments(p, all, 0.5 * S, 2 * S)).toEqual([
      { clipId: "v1", assetId: "v1", at: 0.5 * S, from: 1.5, to: 3, gain: 1 },
      { clipId: "a1", assetId: "a1", at: 1.5 * S, from: 0, to: 0.5, gain: 1 },
    ]);
  });

  it("leaves out videos without audio", () => {
    const p = project([video("v1", 0), video("v3", 2)], []);
    expect(audioSegments(p, all, 0, 4 * S).map((s) => s.clipId)).toEqual(["v1"]);
  });

  it("uses the clip volume as gain", () => {
    const p = project([video("v1", 0, { volume: 0.5 })], [[audio("a1", 0, { volume: 1.8 })]]);
    expect(audioSegments(p, all, 0, S).map((s) => s.gain)).toEqual([0.5, 1.8]);
  });
});
