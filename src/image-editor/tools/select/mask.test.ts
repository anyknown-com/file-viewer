import { expect, it } from "vitest";
import { combineRef, invertRef, opFromEvent, type MaskOp } from "./mask";

it("combines every op over 0, 128 and 255", () => {
  const vals = [0, 128, 255];
  const a = Uint8Array.from(vals.flatMap((x) => vals.map(() => x)));
  const b = Uint8Array.from(vals.flatMap(() => vals));
  const expected: Record<MaskOp, number[]> = {
    replace: [0, 128, 255, 0, 128, 255, 0, 128, 255],
    add: [0, 128, 255, 128, 128, 255, 255, 255, 255],
    subtract: [0, 0, 0, 128, 64, 0, 255, 127, 0],
    intersect: [0, 0, 0, 0, 128, 128, 0, 128, 255],
  };
  for (const op of Object.keys(expected) as MaskOp[]) {
    expect(Array.from(combineRef(a, b, op))).toEqual(expected[op]);
  }
});

it("inverts back to the original", () => {
  const a = Uint8Array.from([0, 1, 128, 254, 255]);
  expect(Array.from(invertRef(a))).toEqual([255, 254, 127, 1, 0]);
  expect(Array.from(invertRef(invertRef(a)))).toEqual(Array.from(a));
});

it("maps modifier keys to ops", () => {
  expect(opFromEvent({ shiftKey: true, altKey: true }, "replace")).toBe("intersect");
  expect(opFromEvent({ shiftKey: true, altKey: false }, "replace")).toBe("add");
  expect(opFromEvent({ shiftKey: false, altKey: true }, "replace")).toBe("subtract");
  expect(opFromEvent({ shiftKey: false, altKey: false }, "add")).toBe("add");
});
