import { describe, expect, it } from "vitest";
import { dragFrame } from "./geometry";

const none = { shift: false, alt: false };

describe("dragFrame", () => {
  it("spans the two points for a rectangle, whichever way it is dragged", () => {
    expect(dragFrame("Rectangle", { x: 10, y: 20 }, { x: 60, y: 50 }, none, 4)).toEqual({
      origin: [10, 20],
      size: [50, 30],
    });
    expect(dragFrame("Rectangle", { x: 60, y: 50 }, { x: 10, y: 20 }, none, 4)).toEqual({
      origin: [10, 20],
      size: [50, 30],
    });
  });

  it("makes a square with Shift, using the larger side", () => {
    const f = dragFrame(
      "Rectangle",
      { x: 10, y: 10 },
      { x: 60, y: 30 },
      { shift: true, alt: false },
      4,
    );
    expect(f.size).toEqual([50, 50]);
    expect(f.origin).toEqual([10, 10]);
    const g = dragFrame(
      "Rectangle",
      { x: 60, y: 60 },
      { x: 40, y: 0 },
      { shift: true, alt: false },
      4,
    );
    expect(g.size).toEqual([60, 60]);
    expect(g.origin).toEqual([0, 0]);
  });

  it("grows from the center with Alt", () => {
    const f = dragFrame(
      "Rectangle",
      { x: 50, y: 50 },
      { x: 70, y: 60 },
      { shift: false, alt: true },
      4,
    );
    expect(f).toEqual({ origin: [30, 40], size: [40, 20] });
  });

  it("treats an ellipse like a rectangle", () => {
    const mods = { shift: true, alt: true };
    expect(dragFrame("Ellipse", { x: 50, y: 50 }, { x: 70, y: 60 }, mods, 4)).toEqual(
      dragFrame("Rectangle", { x: 50, y: 50 }, { x: 70, y: 60 }, mods, 4),
    );
  });

  it("pads a line frame by lineWidth / 2 on every side", () => {
    const f = dragFrame("Line", { x: 10, y: 10 }, { x: 110, y: 60 }, none, 10);
    expect(f.origin).toEqual([5, 5]);
    expect(f.size).toEqual([110, 60]);
    expect(f.start).toEqual([5 / 110, 5 / 60]);
    expect(f.end).toEqual([105 / 110, 55 / 60]);
  });

  it("gives a horizontal line a frame as tall as its width", () => {
    const f = dragFrame("Line", { x: 0, y: 20 }, { x: 100, y: 20 }, none, 8);
    expect(f.size).toEqual([108, 8]);
  });

  it("snaps a 30 degree line to 45 degrees with Shift", () => {
    const b = { x: 100 * Math.cos(Math.PI / 6), y: 100 * Math.sin(Math.PI / 6) };
    const f = dragFrame("Line", { x: 0, y: 0 }, b, { shift: true, alt: false }, 2);
    expect(f.size[0] - 2).toBeCloseTo(f.size[1] - 2, 6);
  });

  it("keeps start and end within 0-1, with Alt too", () => {
    for (const alt of [false, true]) {
      const f = dragFrame("Line", { x: 40, y: 40 }, { x: 5, y: 90 }, { shift: false, alt }, 6);
      for (const v of [...(f.start ?? [9]), ...(f.end ?? [9])]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    const f = dragFrame("Line", { x: 40, y: 40 }, { x: 60, y: 40 }, { shift: false, alt: true }, 2);
    expect(f.start?.[0]).toBeCloseTo(1 / 42 + 0, 6);
    expect(f.end?.[0]).toBeCloseTo(41 / 42, 6);
  });

  it("is at least 1 px per side", () => {
    expect(dragFrame("Rectangle", { x: 5, y: 5 }, { x: 5, y: 5 }, none, 4).size).toEqual([1, 1]);
  });
});
