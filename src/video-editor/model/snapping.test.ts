import { describe, expect, it } from "vitest";
import { type Tracks } from "./project";
import { buildSnapPoints, resolveSnap, snapThreshold } from "./snapping";

const tracks: Tracks = {
  overlay: [],
  main: {
    id: "m",
    muted: false,
    locked: false,
    clips: [
      {
        id: "a",
        kind: "video",
        assetId: "s",
        start: 0,
        in: 0,
        out: 1000,
        volume: 1,
        muted: false,
        fit: "fit",
      },
      {
        id: "b",
        kind: "video",
        assetId: "s",
        start: 2000,
        in: 0,
        out: 500,
        volume: 1,
        muted: false,
        fit: "fit",
      },
    ],
  },
  audio: [],
};

describe("snapping", () => {
  const points = buildSnapPoints(tracks, 1500, new Set());
  it("snaps to the nearest point inside the threshold", () => {
    expect(resolveSnap(1040, points, 100).time).toBe(1000);
    expect(resolveSnap(1450, points, 100).point?.type).toBe("playhead");
  });
  it("does not snap outside the threshold", () => {
    expect(resolveSnap(1250, points, 100)).toEqual({ time: 1250, point: null });
  });
  it("ignores excluded clips", () => {
    const p = buildSnapPoints(tracks, 1500, new Set(["b"]));
    expect(p.some((x) => x.clipId === "b")).toBe(false);
  });
  it("halves the threshold when zoom doubles", () => {
    expect(snapThreshold(200)).toBe(snapThreshold(100) / 2);
  });
});
