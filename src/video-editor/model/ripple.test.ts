import { describe, expect, it } from "vitest";
import { type AudioClip, type Tracks, type VideoClip } from "./project";
import { removeClips } from "./ripple";

const v = (id: string, start: number, len: number): VideoClip => ({
  id,
  kind: "video",
  assetId: "s",
  start,
  in: 0,
  out: len,
  volume: 1,
  muted: false,
  fit: "fit",
});
const a = (id: string, start: number, len: number): AudioClip => ({
  id,
  kind: "audio",
  assetId: "s",
  start,
  in: 0,
  out: len,
  volume: 1,
  muted: false,
});

const build = (locked = false): Tracks => ({
  overlay: [],
  main: {
    id: "m",
    muted: false,
    locked,
    clips: [v("a", 0, 100), v("b", 100, 100), v("c", 200, 100)],
  },
  audio: [{ id: "au", muted: false, locked: false, clips: [a("x", 250, 50)] }],
});

describe("removeClips", () => {
  it("ripple closes the gap", () => {
    const out = removeClips(build(), new Set(["b"]), true);
    expect(out.main.clips.map((c) => [c.id, c.start])).toEqual([
      ["a", 0],
      ["c", 100],
    ]);
  });
  it("leaves a gap without ripple", () => {
    const out = removeClips(build(), new Set(["b"]), false);
    expect(out.main.clips.map((c) => c.start)).toEqual([0, 200]);
  });
  it("sums the shifts when two clips go from one track", () => {
    const out = removeClips(build(), new Set(["a", "b"]), true);
    expect(out.main.clips.map((c) => [c.id, c.start])).toEqual([["c", 0]]);
  });
  it("does not move clips on other tracks", () => {
    expect(removeClips(build(), new Set(["b"]), true).audio[0]!.clips[0]!.start).toBe(250);
  });
  it("does nothing on a locked track", () => {
    expect(removeClips(build(true), new Set(["b"]), true)).toEqual(build(true));
  });
});
