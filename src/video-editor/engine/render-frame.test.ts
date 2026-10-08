import { describe, expect, it } from "vitest";
import type { ImageClip, Project, TextClip, VideoClip } from "../model/project";
import { TICKS_PER_SECOND } from "../model/time";
import { drawPlan, fitRect } from "./render-frame";

const S = TICKS_PER_SECOND;

const video = (id: string, start: number, inS: number, outS: number): VideoClip => ({
  id,
  kind: "video",
  assetId: id,
  start: start * S,
  in: inS * S,
  out: outS * S,
  volume: 1,
  muted: false,
  fit: "fit",
});
const image = (id: string, start: number, duration: number): ImageClip => ({
  id,
  kind: "image",
  assetId: id,
  start: start * S,
  duration: duration * S,
  x: 0.5,
  y: 0.5,
  width: 0.3,
});
const text = (id: string, start: number, duration: number): TextClip => ({
  id,
  kind: "text",
  start: start * S,
  duration: duration * S,
  text: id,
  size: 0.1,
  color: "#ffffff",
  background: false,
  x: 0.5,
  y: 0.5,
});

function project(o: {
  main: VideoClip[];
  overlay: (ImageClip | TextClip)[][];
  hidden?: number;
}): Project {
  return {
    width: 320,
    height: 180,
    fps: 30,
    aspect: "source",
    source: { width: 320, height: 180 },
    tracks: {
      main: { id: "main", muted: false, locked: false, clips: o.main },
      overlay: o.overlay.map((clips, i) => ({
        id: `o${i}`,
        muted: i === o.hidden,
        locked: false,
        clips,
      })),
      audio: [],
    },
  };
}

describe("drawPlan", () => {
  it("orders the video, then the bottom overlay, then the top overlay", () => {
    const p = project({
      main: [video("v", 0, 1, 5)],
      overlay: [[text("top", 0, 4)], [image("bottom", 0, 4)]],
    });
    expect(drawPlan(p, 2 * S)).toEqual([
      { kind: "video", assetId: "v", seconds: 3, fit: "fit" },
      { kind: "image", assetId: "bottom", x: 0.5, y: 0.5, width: 0.3 },
      { kind: "text", clip: p.tracks.overlay[0]!.clips[0] },
    ]);
  });

  it("leaves out a hidden overlay track", () => {
    const p = project({
      main: [video("v", 0, 0, 4)],
      overlay: [[text("top", 0, 4)], [image("bottom", 0, 4)]],
      hidden: 0,
    });
    expect(drawPlan(p, S).map((i) => i.kind)).toEqual(["video", "image"]);
  });

  it("has no video item in a gap between clips", () => {
    const p = project({ main: [video("a", 0, 0, 1), video("b", 2, 0, 1)], overlay: [] });
    expect(drawPlan(p, 1.5 * S)).toEqual([]);
    expect(drawPlan(p, 1 * S)).toEqual([]);
    expect(drawPlan(p, 2 * S)).toEqual([{ kind: "video", assetId: "b", seconds: 0, fit: "fit" }]);
  });
});

describe("fitRect", () => {
  it("letterboxes 16:9 inside 1:1 with fit", () => {
    expect(fitRect(1600, 900, 100, 100, "fit")).toEqual({ x: 0, y: 21.875, w: 100, h: 56.25 });
  });

  it("crops 16:9 to cover 1:1 with fill", () => {
    const r = fitRect(1600, 900, 100, 100, "fill");
    expect(r.y).toBe(0);
    expect(r.h).toBe(100);
    expect(r.w).toBeCloseTo(177.78, 2);
    expect(r.x).toBeCloseTo(-38.89, 2);
  });
});
