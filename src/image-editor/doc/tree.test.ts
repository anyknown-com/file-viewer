import { describe, expect, it } from "vitest";
import type { Layer } from "../api";
import { makeDoc } from "../test/make-doc";
import {
  ancestors,
  children,
  depth,
  isVisibleInTree,
  MAX_DEPTH,
  subtreeRange,
  treeOrder,
} from "./tree";

const id = (n: number): string => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

describe("tree", () => {
  // [0] bottom, [1] A folder { [2] B folder { [3] C folder { [4] leaf } [5] b2 } [6] a2 }, [7] top
  const nested = makeDoc({
    width: 4,
    height: 4,
    layers: [
      { id: id(0) },
      { id: id(1), isGroup: true },
      { id: id(2), isGroup: true, parentID: id(1) },
      { id: id(3), isGroup: true, parentID: id(2) },
      { id: id(4), parentID: id(3) },
      { id: id(5), parentID: id(2) },
      { id: id(6), parentID: id(1) },
      { id: id(7) },
    ],
  }).manifest;

  it("gives each nested folder its contiguous range", () => {
    expect(subtreeRange(nested, id(1))).toEqual([1, 7]);
    expect(subtreeRange(nested, id(2))).toEqual([2, 6]);
    expect(subtreeRange(nested, id(3))).toEqual([3, 5]);
    expect(subtreeRange(nested, id(4))).toEqual([4, 5]);
    expect(subtreeRange(nested, id(7))).toEqual([7, 8]);
  });

  it("lists children, ancestors and depth", () => {
    expect(children(nested, null).map((l) => l.id)).toEqual([id(0), id(1), id(7)]);
    expect(children(nested, id(2)).map((l) => l.id)).toEqual([id(3), id(5)]);
    expect(ancestors(nested, id(4)).map((l) => l.id)).toEqual([id(3), id(2), id(1)]);
    expect(depth(nested, id(4))).toBe(3);
    expect(depth(nested, id(0))).toBe(0);
  });

  it("walks children order when descendants are not contiguous", () => {
    // Folder F's children sit apart from it: F, X (root), c1 (in F), c2 (in F)
    const m = makeDoc({
      width: 4,
      height: 4,
      layers: [
        { id: id(1), parentID: id(9) },
        { id: id(9), isGroup: true },
        { id: id(2) },
        { id: id(3), parentID: id(9) },
      ],
    }).manifest;
    expect(children(m, id(9)).map((l) => l.id)).toEqual([id(1), id(3)]);
    expect(subtreeRange(m, id(9))).toEqual([1, 4]);
    expect(treeOrder(m.layers).map((l) => l.id)).toEqual([id(9), id(1), id(3), id(2)]);
  });

  it("counts depth up to the 64th level", () => {
    const layers: Partial<Layer>[] = [];
    for (let i = 0; i <= MAX_DEPTH; i++) {
      layers.push({ id: id(i), isGroup: i < MAX_DEPTH, ...(i > 0 ? { parentID: id(i - 1) } : {}) });
    }
    const m = makeDoc({ width: 4, height: 4, layers }).manifest;
    expect(depth(m, id(MAX_DEPTH))).toBe(64);
    expect(treeOrder(m.layers)).toHaveLength(MAX_DEPTH + 1);
  });

  it("is visible only when every folder above is", () => {
    const hidden = {
      ...nested,
      layers: nested.layers.map((l) => (l.id === id(2) ? { ...l, isVisible: false } : l)),
    };
    expect(isVisibleInTree(hidden, id(4))).toBe(false);
    expect(isVisibleInTree(hidden, id(6))).toBe(true);
    expect(isVisibleInTree(nested, id(4))).toBe(true);
  });
});
