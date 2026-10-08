import { describe, expect, it } from "vitest";
import { cut, initialEdit, split } from "./edit";
import { type Block, plan } from "./plan";

const length = (b: Block) => b.srcEnd - b.srcStart;

describe("plan", () => {
  it("plans one block inside a single segment", () => {
    expect(plan(initialEdit(10), 1, 3, null)).toEqual([{ outStart: 1, srcStart: 1, srcEnd: 3 }]);
  });

  it("starts a new block at a segment boundary and keeps blocks contiguous", () => {
    const blocks = plan(split(initialEdit(10), 4), 2, 7, null);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].outStart + length(blocks[0])).toBeCloseTo(blocks[1].outStart, 9);
    expect(blocks.map((b) => [b.srcStart, b.srcEnd])).toEqual([
      [2, 4],
      [4, 7],
    ]);
  });

  it("skips the source of a deleted range", () => {
    const blocks = plan(cut(initialEdit(10), { start: 3, end: 6 }), 0, 7, null);
    expect(blocks.map((b) => [b.outStart, b.srcStart, b.srcEnd])).toEqual([
      [0, 0, 3],
      [3, 6, 10],
    ]);
  });

  it("stops at the end of the edit without a loop", () => {
    const blocks = plan(initialEdit(4), 3, 10, null);
    expect(blocks).toEqual([{ outStart: 3, srcStart: 3, srcEnd: 4 }]);
  });

  it("loops a 2 s selection for 5 s and wraps from loop.end to loop.start", () => {
    const loop = { start: 1, end: 3 };
    const blocks = plan(initialEdit(10), 1, 6, loop);
    const total = blocks.reduce((sum, b) => sum + length(b), 0);
    expect(total).toBeCloseTo(5, 9);
    expect(blocks.map((b) => [b.outStart, b.srcStart, b.srcEnd])).toEqual([
      [1, 1, 3],
      [3, 1, 3],
      [5, 1, 2],
    ]);
  });

  it("plays up to loop.end before looping when starting before the loop", () => {
    const blocks = plan(initialEdit(10), 0, 5, { start: 2, end: 3 });
    expect(blocks.map((b) => [b.outStart, b.srcStart, b.srcEnd])).toEqual([
      [0, 0, 3],
      [3, 2, 3],
      [4, 2, 3],
    ]);
  });

  it("splits a loop at segment boundaries inside it", () => {
    const blocks = plan(split(initialEdit(10), 2), 1, 5, { start: 1, end: 3 });
    expect(blocks.map((b) => [b.outStart, b.srcStart, b.srcEnd])).toEqual([
      [1, 1, 2],
      [2, 2, 3],
      [3, 1, 2],
      [4, 2, 3],
    ]);
  });

  it("starts the first block mid-segment at the right source time", () => {
    const e = cut(initialEdit(10), { start: 2, end: 5 });
    const blocks = plan(e, 3.5, 4, null);
    expect(blocks).toEqual([{ outStart: 3.5, srcStart: 6.5, srcEnd: 7 }]);
  });
});
