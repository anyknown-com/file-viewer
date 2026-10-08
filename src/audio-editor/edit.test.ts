import { describe, expect, it } from "vitest";
import {
  type AudioEdit,
  boundaries,
  cut,
  fade,
  gain,
  initialEdit,
  keep,
  outputDuration,
  sourceAt,
  split,
} from "./edit";

const twoSegments = (): AudioEdit => split(initialEdit(10), 4);

describe("edit", () => {
  it("starts with one segment covering the file", () => {
    const e = initialEdit(10);
    expect(e.segments).toEqual([{ id: "s1", in: 0, out: 10 }]);
    expect(outputDuration(e)).toBe(10);
    expect(boundaries(e)).toEqual([0, 10]);
  });

  it("cut across two segments leaves two segments with correct in/out", () => {
    const e = cut(twoSegments(), { start: 3, end: 6 });
    expect(e.segments.map((s) => [s.in, s.out])).toEqual([
      [0, 3],
      [6, 10],
    ]);
    expect(outputDuration(e)).toBe(7);
  });

  it("cut inside one segment splits it with a fresh id", () => {
    const e = cut(initialEdit(10), { start: 2, end: 5 });
    expect(e.segments).toEqual([
      { id: "s1", in: 0, out: 2 },
      { id: "s2", in: 5, out: 10 },
    ]);
  });

  it("keep leaves exactly the range", () => {
    const e = keep(twoSegments(), { start: 3, end: 7 });
    expect(outputDuration(e)).toBe(4);
    expect(e.segments.map((s) => [s.in, s.out])).toEqual([
      [3, 4],
      [4, 7],
    ]);
  });

  it("shifts gains after a cut earlier", () => {
    const e = cut(gain(initialEdit(10), { start: 6, end: 8 }, 3), { start: 1, end: 3 });
    expect(e.gains[0]).toMatchObject({ start: 4, end: 6 });
  });

  it("truncates gains crossing the cut edge", () => {
    const base = gain(initialEdit(10), { start: 2, end: 6 }, 3);
    expect(cut(base, { start: 4, end: 8 }).gains[0]).toMatchObject({ start: 2, end: 4 });
    expect(cut(base, { start: 0, end: 3 }).gains[0]).toMatchObject({ start: 0, end: 3 });
    expect(cut(base, { start: 3, end: 5 }).gains[0]).toMatchObject({ start: 2, end: 4 });
  });

  it("drops gains fully inside the cut", () => {
    const e = cut(fade(initialEdit(10), { start: 3, end: 5 }, "in"), { start: 2, end: 6 });
    expect(e.gains).toEqual([]);
  });

  it("split adds a boundary and keeps the duration", () => {
    const before = initialEdit(10);
    const after = split(before, 4);
    expect(boundaries(after)).toEqual([0, 4, 10]);
    expect(outputDuration(after)).toBe(10);
  });

  it("split on a boundary returns the same state", () => {
    const e = twoSegments();
    expect(split(e, 4)).toBe(e);
    expect(split(e, 0)).toBe(e);
    expect(split(e, 10)).toBe(e);
  });

  it("sourceAt maps across segments and boundaries", () => {
    const e = cut(initialEdit(10), { start: 2, end: 5 });
    expect(sourceAt(e, 1)?.source).toBe(1);
    expect(sourceAt(e, 3)).toMatchObject({ source: 6, segment: { id: "s2" } });
    expect(sourceAt(e, 2)).toMatchObject({ source: 5, segment: { id: "s2" } });
    expect(sourceAt(e, 7)).toMatchObject({ source: 10, segment: { id: "s2" } });
    expect(sourceAt(e, 8)).toBeNull();
  });

  it("ids increase and never repeat", () => {
    let e = initialEdit(10);
    e = split(e, 2);
    e = split(e, 5);
    e = fade(e, { start: 0, end: 1 }, "in");
    e = gain(e, { start: 1, end: 2 }, -3);
    e = cut(e, { start: 6, end: 7 });
    const ids = e.segments.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(e.gains.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(e.gains[1]).toMatchObject({ kind: "gain", db: -3 });
  });

  it("does not mutate its input", () => {
    const e = gain(twoSegments(), { start: 5, end: 8 }, 2);
    const snapshot = structuredClone(e);
    cut(e, { start: 3, end: 6 });
    keep(e, { start: 3, end: 6 });
    split(e, 7);
    fade(e, { start: 0, end: 1 }, "out");
    gain(e, { start: 0, end: 1 }, 1);
    expect(e).toEqual(snapshot);
  });
});
