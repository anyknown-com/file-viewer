import { describe, expect, it } from "vitest";
import type { VideoClip } from "../../model/project";
import { buildSnapPoints } from "../../model/snapping";
import { secondsToTicks } from "../../model/time";
import { dragMove, dragTrim, pxToTicks, ticksToPx } from "./geometry";

const s = secondsToTicks;
const clip = (id: string, start: number, length: number): VideoClip => ({
  id,
  kind: "video",
  assetId: "source",
  start: s(start),
  in: 0,
  out: s(length),
  volume: 1,
  muted: false,
  fit: "fit",
});

describe("geometry", () => {
  it("converts between px and ticks and back", () => {
    for (const pps of [5, 50, 137, 400]) {
      expect(pxToTicks(ticksToPx(s(3.5), pps), pps)).toBe(s(3.5));
      expect(ticksToPx(pxToTicks(240, pps), pps)).toBeCloseTo(240, 2);
    }
  });

  it("snaps the clip's tail to the playhead within 10 px", () => {
    // 50 px/s: the 2 s clip ends at 2 s; dragging 140 px puts the tail at 4.8 s, 0.2 s = 10 px short of 5 s.
    const r = dragMove({ clip: clip("a", 0, 2), dxPx: 140, pps: 50, points: [], playhead: s(5) });
    expect(r).toEqual({ start: s(3), snapLine: s(5) });
  });

  it("does not snap beyond 10 px", () => {
    const r = dragMove({ clip: clip("a", 0, 2), dxPx: 139, pps: 50, points: [], playhead: s(5) });
    expect(r.snapLine).toBeNull();
    expect(r.start).toBe(pxToTicks(139, 50));
  });

  it("snaps a trimmed head to the end of the clip before it", () => {
    const before = clip("a", 0, 2);
    const target = clip("b", 3, 2);
    const points = buildSnapPoints(
      {
        overlay: [],
        main: { id: "m", muted: false, locked: false, clips: [before, target] },
        audio: [],
      },
      s(20),
      new Set(["b"]),
    );
    // Head at 3 s dragged 46 px left = 2.08 s, 4 px from the previous clip's end.
    const r = dragTrim({ clip: target, edge: "start", dxPx: -46, pps: 50, points });
    expect(r).toEqual({ to: s(2), snapLine: s(2) });
  });
});
