import { describe, expect, it } from "vitest";
import { snapOffset } from "./snap";

const box = { x: 100, y: 100, width: 50, height: 40 };
const none = { xs: [], ys: [] };

describe("snapOffset", () => {
  it("snaps an edge within the threshold and not beyond", () => {
    expect(snapOffset(box, { ...none, xs: [91] }, 10)).toEqual({ x: -9, y: 0 });
    expect(snapOffset(box, { ...none, xs: [89] }, 10)).toEqual({ x: 0, y: 0 });
    expect(snapOffset(box, { ...none, ys: [149] }, 10)).toEqual({ x: 0, y: 9 });
    expect(snapOffset(box, { ...none, ys: [151] }, 10)).toEqual({ x: 0, y: 0 });
  });

  it("snaps x and y together", () => {
    expect(snapOffset(box, { xs: [155], ys: [95] }, 10)).toEqual({ x: 5, y: -5 });
  });

  it("snaps center to center", () => {
    // Box center (125, 120); targets at another box's center.
    expect(snapOffset(box, { xs: [128], ys: [117] }, 10)).toEqual({ x: 3, y: -3 });
  });

  it("takes the nearest of several targets", () => {
    expect(snapOffset(box, { ...none, xs: [96, 102] }, 10)).toEqual({ x: 2, y: 0 });
  });
});
