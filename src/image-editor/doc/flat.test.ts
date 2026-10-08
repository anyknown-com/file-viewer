import { describe, expect, it } from "vitest";
import type { Layer } from "../api";
import { makeDoc } from "../test/make-doc";
import { isFlat } from "./flat";

const flat = (layer: Partial<Layer>): boolean =>
  isFlat(makeDoc({ width: 8, height: 6, layers: [layer] }));
const covering: Layer["transform"] = {
  origin: [0, 0],
  size: [8, 6],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality",
};

describe("isFlat", () => {
  it("is true for one plain layer", () => {
    expect(flat({})).toBe(true);
  });

  it("is false for anything a flat image cannot hold", () => {
    expect(flat({ maskFile: "X.mask.png" })).toBe(false);
    expect(flat({ opacity: 0.5 })).toBe(false);
    expect(flat({ transform: { ...covering, rotation: 15 } })).toBe(false);
    expect(flat({ transform: { ...covering, flipX: true } })).toBe(false);
    expect(flat({ blendMode: "Multiply" })).toBe(false);
    expect(flat({ isVisible: false })).toBe(false);
    expect(isFlat(makeDoc({ width: 8, height: 6, layers: [{}, {}] }))).toBe(false);
  });
});
