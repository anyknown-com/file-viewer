import { describe, expect, it } from "vitest";
import { type Clip, type TextClip, type Tracks, type VideoClip } from "./project";
import { splitClip, splitTracks } from "./split";

const video: VideoClip = {
  id: "v",
  kind: "video",
  assetId: "s",
  start: 1000,
  in: 200,
  out: 1200,
  volume: 1,
  muted: false,
  fit: "fit",
};
const text: TextClip = {
  id: "t",
  kind: "text",
  start: 0,
  duration: 600,
  text: "hi",
  size: 0.1,
  color: "#ffffff",
  background: false,
  x: 0.5,
  y: 0.5,
};

const build = (locked = false): Tracks => ({
  overlay: [{ id: "o", muted: false, locked, clips: [text] }],
  main: { id: "m", muted: false, locked, clips: [video] },
  audio: [],
});

describe("splitClip", () => {
  it("splits mid-clip with contiguous in/out and the same total length", () => {
    const [l, r] = splitClip(video, 1400, "r") as [VideoClip, VideoClip];
    expect(l.out).toBe(600);
    expect(r).toMatchObject({ id: "r", start: 1400, in: 600, out: 1200 });
    expect(l.out - l.in + (r.out - r.in)).toBe(video.out - video.in);
  });
  it("returns null exactly at the start or the end", () => {
    expect(splitClip(video, 1000, "r")).toBeNull();
    expect(splitClip(video, 2000, "r")).toBeNull();
  });
  it("splits text clips", () => {
    const [l, r] = splitClip(text, 250, "r") as [TextClip, TextClip];
    expect([l.duration, r.start, r.duration]).toEqual([250, 250, 350]);
  });
});

describe("splitTracks", () => {
  it("skips locked tracks", () => {
    expect(splitTracks(build(true), 300, new Set(), () => "n")).toEqual(build(true));
  });
  it("splits only selected clips when there is a selection", () => {
    const out = splitTracks(build(), 300, new Set(["t"]), () => "n");
    expect(out.overlay[0]!.clips).toHaveLength(2);
    const unaffected: Clip[] = out.main.clips;
    expect(unaffected).toHaveLength(1);
    const both = splitTracks(build(), 1300, new Set(), () => "n");
    expect(both.main.clips).toHaveLength(2);
  });
});
