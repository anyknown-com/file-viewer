import { describe, expect, it } from "vitest";
import {
  type AssetMeta,
  type Clip,
  type Aspect,
  canvasSize,
  clipEnd,
  clipLength,
  createProject,
  findClip,
  projectDuration,
} from "./project";
import { secondsToTicks } from "./time";

const meta = (over: Partial<AssetMeta> = {}): AssetMeta => ({
  id: "source",
  name: "a.mp4",
  kind: "video",
  duration: secondsToTicks(10),
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
  ...over,
});

describe("canvasSize", () => {
  it("returns even sizes for every aspect", () => {
    const aspects: Aspect[] = ["source", "16:9", "9:16", "1:1"];
    for (const a of aspects) {
      const s = canvasSize(a, { width: 854, height: 482 });
      expect(s.width % 2).toBe(0);
      expect(s.height % 2).toBe(0);
    }
  });
  it("9:16 of 1920x1080 is 1080x1920", () => {
    expect(canvasSize("9:16", { width: 1920, height: 1080 })).toEqual({
      width: 1080,
      height: 1920,
    });
  });
});

describe("createProject", () => {
  it("duration equals the source duration", () => {
    expect(projectDuration(createProject(meta()))).toBe(secondsToTicks(10));
  });
  it("clamps 120 fps to 60", () => {
    expect(createProject(meta({ fps: 120 })).fps).toBe(60);
  });
});

describe("clip helpers", () => {
  const clips: Clip[] = [
    {
      id: "v",
      kind: "video",
      assetId: "s",
      start: 100,
      in: 10,
      out: 60,
      volume: 1,
      muted: false,
      fit: "fit",
    },
    { id: "a", kind: "audio", assetId: "s", start: 100, in: 0, out: 30, volume: 1, muted: false },
    { id: "i", kind: "image", assetId: "s", start: 100, duration: 40, x: 0.5, y: 0.5, width: 0.3 },
    {
      id: "t",
      kind: "text",
      start: 100,
      duration: 20,
      text: "x",
      size: 0.1,
      color: "#ffffff",
      background: false,
      x: 0.5,
      y: 0.5,
    },
  ];
  it("clipLength and clipEnd are right for all four kinds", () => {
    expect(clips.map(clipLength)).toEqual([50, 30, 40, 20]);
    expect(clips.map(clipEnd)).toEqual([150, 130, 140, 120]);
  });
  it("findClip returns null when missing", () => {
    const p = createProject(meta());
    expect(findClip(p.tracks, "nope")).toBeNull();
    expect(findClip(p.tracks, p.tracks.main.clips[0]!.id)?.track.id).toBe(p.tracks.main.id);
  });
});
