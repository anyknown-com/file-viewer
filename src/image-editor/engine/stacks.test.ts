import { describe, expect, it } from "vitest";
import type { Layer } from "../api";
import { makeDoc } from "../test/make-doc";
import { clipStacks, coverageChain } from "./stacks";

const ADJ = { kind: "Invert" } as unknown as NonNullable<Layer["adjustment"]>;

describe("clipStacks", () => {
  it("puts two clipped layers on one base", () => {
    const doc = makeDoc({ width: 4, height: 4, layers: [{ id: "B" }, {}, {}] });
    const [base, a, b] = doc.manifest.layers;
    a.maskSourceID = base.id;
    b.maskSourceID = base.id;
    expect(clipStacks(doc.manifest)).toEqual(new Map([[base.id, [a.id, b.id]]]));
  });

  it("forms no stack on an adjustment layer", () => {
    const doc = makeDoc({ width: 4, height: 4, layers: [{ adjustment: ADJ }, {}] });
    const [base, a] = doc.manifest.layers;
    a.maskSourceID = base.id;
    expect(clipStacks(doc.manifest).size).toBe(0);
  });

  it("breaks the stack at a layer that is not clipped", () => {
    const doc = makeDoc({ width: 4, height: 4, layers: [{}, {}, {}, {}] });
    const [base, a, plain, b] = doc.manifest.layers;
    a.maskSourceID = base.id;
    b.maskSourceID = base.id;
    expect(plain.maskSourceID).toBeUndefined();
    expect(clipStacks(doc.manifest)).toEqual(new Map([[base.id, [a.id]]]));
  });

  it("forms no stack on a hidden base", () => {
    const doc = makeDoc({ width: 4, height: 4, layers: [{ isVisible: false }, {}] });
    const [base, a] = doc.manifest.layers;
    a.maskSourceID = base.id;
    expect(clipStacks(doc.manifest).size).toBe(0);
  });
});

describe("coverageChain", () => {
  it("follows maskSourceID", () => {
    const doc = makeDoc({ width: 4, height: 4, layers: [{}, {}, {}] });
    const [a, b, c] = doc.manifest.layers;
    c.maskSourceID = b.id;
    b.maskSourceID = a.id;
    expect(coverageChain(doc.manifest, c.id)).toEqual([c.id, b.id, a.id]);
  });

  it("returns nothing for a loop", () => {
    const doc = makeDoc({ width: 4, height: 4, layers: [{}, {}] });
    const [a, b] = doc.manifest.layers;
    a.maskSourceID = b.id;
    b.maskSourceID = a.id;
    expect(coverageChain(doc.manifest, a.id)).toEqual([]);
  });

  it("returns nothing for a chain of 257 layers but keeps 256", () => {
    const doc = makeDoc({ width: 4, height: 4, layers: Array.from({ length: 257 }, () => ({})) });
    const layers = doc.manifest.layers;
    for (let i = 1; i < layers.length; i++) layers[i].maskSourceID = layers[i - 1].id;
    expect(coverageChain(doc.manifest, layers[256].id)).toEqual([]);
    expect(coverageChain(doc.manifest, layers[255].id)).toHaveLength(256);
  });
});
