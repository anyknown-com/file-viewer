import { describe, expect, it } from "vitest";
import { laneOf, nearestFreeStart, placeClip, pruneEmpty } from "./placement";
import type { AudioClip, ImageClip, Track, Tracks, VideoClip } from "./project";

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
const img = (id: string, start: number, len: number): ImageClip => ({
  id,
  kind: "image",
  assetId: "s",
  start,
  duration: len,
  x: 0.5,
  y: 0.5,
  width: 0.3,
});
const tr = <C extends VideoClip | AudioClip | ImageClip>(
  id: string,
  clips: C[],
  locked = false,
): Track<C> => ({
  id,
  muted: false,
  locked,
  clips,
});

let n = 0;
const makeId = () => `new${++n}`;

const base = (): Tracks => ({
  overlay: [],
  main: tr("m", [v("a", 0, 100), v("b", 200, 100)]),
  audio: [],
});

describe("placeClip", () => {
  it("main: an overlapping drop goes to the nearest free slot", () => {
    const out = placeClip(base(), v("n", 90, 50), "m", makeId)!;
    expect(out.main.clips.map((c) => [c.id, c.start])).toEqual([
      ["a", 0],
      ["n", 100],
      ["b", 200],
    ]);
  });

  it("overlay: adds a track on top when all are full", () => {
    const t: Tracks = { ...base(), overlay: [tr("o1", [img("i1", 0, 100)])] };
    const out = placeClip(t, img("i2", 50, 100), null, makeId)!;
    expect(out.overlay).toHaveLength(2);
    expect(out.overlay[0]!.clips[0]!.id).toBe("i2");
    expect(out.overlay[1]!.id).toBe("o1");
  });

  it("overlay: picks the first track without overlap", () => {
    const t: Tracks = {
      ...base(),
      overlay: [tr("o1", [img("i1", 0, 100)]), tr("o2", [])],
    };
    const out = placeClip(t, img("i2", 50, 100), null, makeId)!;
    expect(out.overlay[1]!.clips.map((c) => c.id)).toEqual(["i2"]);
  });

  it("audio: the 4th track is refused, falls back to a free slot", () => {
    const t: Tracks = {
      ...base(),
      audio: [
        tr("a1", [a("x1", 0, 100)]),
        tr("a2", [a("x2", 0, 100)]),
        tr("a3", [a("x3", 0, 100)]),
      ],
    };
    const out = placeClip(t, a("y", 0, 50), null, makeId)!;
    expect(out.audio).toHaveLength(3);
    expect(out.audio[0]!.clips.find((c) => c.id === "y")!.start).toBe(100);
  });

  it("returns null for a locked track", () => {
    const t: Tracks = { ...base(), main: tr("m", [], true) };
    expect(placeClip(t, v("n", 0, 10), "m", makeId)).toBeNull();
  });

  it("returns null when the lane does not match", () => {
    expect(placeClip(base(), a("y", 0, 10), "m", makeId)).toBeNull();
  });
});

describe("helpers", () => {
  it("laneOf maps kinds to lanes", () => {
    expect([laneOf(v("a", 0, 1)), laneOf(a("b", 0, 1)), laneOf(img("c", 0, 1))]).toEqual([
      "main",
      "audio",
      "overlay",
    ]);
  });
  it("nearestFreeStart prefers the earlier slot on a tie", () => {
    const t = tr("m", [v("a", 100, 100)]);
    expect(nearestFreeStart(t, 100, 100)).toBe(0);
  });
  it("pruneEmpty never removes main", () => {
    const t: Tracks = { overlay: [tr("o", [])], main: tr("m", []), audio: [tr("a", [])] };
    const out = pruneEmpty(t);
    expect(out.main.id).toBe("m");
    expect(out.overlay).toEqual([]);
    expect(out.audio).toEqual([]);
  });
});
