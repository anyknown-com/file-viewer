import { describe, expect, it } from "vitest";
import { initialEdit, split } from "./edit";
import { dragSelect, moveHandle, segmentAt, snap } from "./selection";

// 1/8 s per pixel is exact in binary, so pixel distances below are exact too.
const view = { start: 0, secondsPerPixel: 0.125, width: 800 };

describe("selection", () => {
  it("snaps within 8 px and not at 9 px", () => {
    expect(snap(5 + 8 * 0.125, [5], view)).toBe(5);
    expect(snap(5 - 8 * 0.125, [5], view)).toBe(5);
    expect(snap(5 + 9 * 0.125, [5], view)).toBe(5 + 9 * 0.125);
  });

  it("snaps to the nearest target", () => {
    expect(snap(5.5, [5, 6, 5.625], view)).toBe(5.625);
  });

  it("orders a drag either way and snaps both ends", () => {
    expect(dragSelect(7, 3.25, [3, 10], view)).toEqual({ start: 3, end: 7 });
  });

  it("swaps the edges when a handle is dragged past the other one", () => {
    const sel = { start: 2, end: 4 };
    expect(moveHandle(sel, "start", 6, [], view)).toEqual({ start: 4, end: 6 });
    expect(moveHandle(sel, "end", 1, [], view)).toEqual({ start: 1, end: 2 });
    expect(moveHandle(sel, "end", 5, [], view)).toEqual({ start: 2, end: 5 });
  });

  it("double click selects the two boundaries around the time", () => {
    const state = split(split(initialEdit(10), 3), 7);
    expect(segmentAt(state, 5)).toEqual({ start: 3, end: 7 });
    expect(segmentAt(state, 1)).toEqual({ start: 0, end: 3 });
    expect(segmentAt(state, 10)).toEqual({ start: 7, end: 10 });
  });

  it("double click selects everything when there are no segment boundaries", () => {
    expect(segmentAt(initialEdit(10), 4)).toEqual({ start: 0, end: 10 });
  });
});
