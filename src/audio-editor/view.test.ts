import { describe, expect, it } from "vitest";
import { boundaries, cut, fade, initialEdit } from "./edit";
import type { PeakLevel, Peaks } from "./peaks";
import { clampView, columns, fitView, sampleColumns, scroll, timeAt, xAt, zoom } from "./view";

const RATE = 48000;

/** One level per entry; every bin of a level holds +-value so the chosen level shows in the columns. */
function fakePeaks(seconds: number, levels: [framesPerBin: number, value: number][]): Peaks {
  const frames = seconds * RATE;
  return {
    sampleRate: RATE,
    channels: 2,
    frames,
    levels: levels.map(([framesPerBin, value]): PeakLevel => {
      const bins = Math.ceil(frames / framesPerBin);
      const v = Math.round(value * 32767);
      return {
        framesPerBin,
        min: [new Int16Array(bins).fill(-v), new Int16Array(bins).fill(-v)],
        max: [new Int16Array(bins).fill(v), new Int16Array(bins).fill(v)],
      };
    }),
  };
}

describe("view", () => {
  it("timeAt and xAt are inverses", () => {
    const v = { start: 3.5, secondsPerPixel: 0.01, width: 800 };
    for (const x of [0, 1, 123.5, 799]) expect(xAt(v, timeAt(v, x))).toBeCloseTo(x, 9);
    for (const t of [3.5, 4, 9.25]) expect(timeAt(v, xAt(v, t))).toBeCloseTo(t, 9);
  });

  it("fitView puts the whole duration across the width", () => {
    const v = fitView(60, 600);
    expect(v.start).toBe(0);
    expect(timeAt(v, 600)).toBeCloseTo(60, 9);
  });

  it("zoom keeps the time under the anchor in place", () => {
    const v = { start: 10, secondsPerPixel: 0.05, width: 400 };
    const anchorX = 150;
    const before = timeAt(v, anchorX);
    const z = zoom(v, 0.5, anchorX, 120, RATE);
    expect(z.secondsPerPixel).toBeCloseTo(0.025, 12);
    expect(timeAt(z, anchorX)).toBeCloseTo(before, 9);
  });

  it("zoom stays between one sample per pixel and the whole duration", () => {
    const v = fitView(10, 1000);
    expect(zoom(v, 1e-9, 500, 10, RATE).secondsPerPixel).toBeCloseTo(1 / RATE, 12);
    const out = zoom(v, 8, 500, 10, RATE);
    expect(out.secondsPerPixel).toBeCloseTo(0.01, 12);
    expect(out.start).toBe(0);
  });

  it("zoom and scroll never go past either end", () => {
    const v = { start: 0, secondsPerPixel: 0.01, width: 100 };
    expect(scroll(v, -50, 10).start).toBe(0);
    expect(scroll(v, 5000, 10).start).toBeCloseTo(9, 9);
    const z = zoom({ ...v, start: 9 }, 2, 100, 10, RATE);
    expect(z.start + z.width * z.secondsPerPixel).toBeLessThanOrEqual(10 + 1e-9);
    expect(z.start).toBeGreaterThanOrEqual(0);
  });

  it("clampView pulls the view back after the timeline gets shorter", () => {
    const v = clampView({ start: 8, secondsPerPixel: 0.01, width: 100 }, 5);
    expect(v.start).toBeCloseTo(4, 9);
  });
});

describe("columns", () => {
  it("uses the coarsest level with framesPerBin <= the frames per pixel", () => {
    const peaks = fakePeaks(10, [
      [256, 0.1],
      [512, 0.2],
      [2048, 0.3],
    ]);
    const view = { start: 0, secondsPerPixel: 1000 / RATE, width: 50 };
    const c = columns(peaks, initialEdit(10), view);
    expect(c.max[10]).toBeCloseTo(0.2, 3);
    expect(c.min[10]).toBeCloseTo(-0.2, 3);
  });

  it("rises across a fade in", () => {
    const peaks = fakePeaks(10, [[256, 0.8]]);
    const state = fade(initialEdit(10), { start: 0, end: 10 }, "in");
    const c = columns(peaks, state, fitView(10, 100));
    for (let x = 1; x < 100; x++) expect(c.max[x]).toBeGreaterThan(c.max[x - 1]);
    expect(c.max[99]).toBeLessThanOrEqual(0.8 + 1e-6);
  });

  it("marks a seam where the middle was cut", () => {
    const peaks = fakePeaks(10, [[256, 0.5]]);
    const state = cut(initialEdit(10), { start: 4, end: 6 });
    const view = fitView(8, 800);
    const c = columns(peaks, state, view);
    expect(c.seams).toHaveLength(1);
    expect(c.seams[0]).toBeCloseTo(400, 6);
    expect(boundaries(state)).toContain(4);
  });

  it("is flat past the end of the timeline", () => {
    const peaks = fakePeaks(10, [[256, 0.5]]);
    const c = columns(peaks, initialEdit(10), { start: 0, secondsPerPixel: 0.1, width: 200 });
    expect(c.max[50]).toBeCloseTo(0.5, 3);
    expect(c.max[150]).toBe(0);
  });

  it("reads decoded samples when zoomed past the peak table", () => {
    const planes = [new Float32Array(RATE), new Float32Array(RATE)];
    planes[0][4800] = 0.9;
    planes[1][4810] = -0.7;
    const view = { start: 1.1, secondsPerPixel: 10 / RATE, width: 20 };
    const c = sampleColumns(planes, 1, RATE, initialEdit(10), view);
    expect(c.max[0]).toBeCloseTo(0.9, 6);
    expect(c.min[1]).toBeCloseTo(-0.7, 6);
    expect(c.max[2]).toBe(0);
  });
});
