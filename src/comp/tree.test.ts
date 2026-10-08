// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type LayerRecord, layerRecordSchema } from "./manifest-layer";
import { sortTreeOrder, treeEntries } from "./tree";

const transform = {
  origin: [0, 0],
  size: [10, 10],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality",
};

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function layer(n: number, extra: Record<string, unknown> = {}): LayerRecord {
  return layerRecordSchema.parse({
    id: id(n),
    name: `L${n}`,
    isVisible: true,
    transform,
    ...extra,
  });
}

function names(layers: LayerRecord[]): string[] {
  return layers.map((l) => l.name);
}

describe("treeEntries", () => {
  const a = layer(1, { isGroup: true });
  const b = layer(2);
  const c = layer(3, { parentID: id(1) });

  it("follows each folder with its descendants, bottom first", () => {
    expect(names(treeEntries([a, b, c], false).map((e) => e.layer))).toEqual(["L1", "L3", "L2"]);
  });

  it("reverses siblings when top first", () => {
    const entries = treeEntries([a, b, c], true);
    expect(names(entries.map((e) => e.layer))).toEqual(["L2", "L1", "L3"]);
    expect(entries.map((e) => e.depth)).toEqual([0, 0, 1]);
  });

  it("hides the children of a hidden folder", () => {
    const hidden = layer(1, { isGroup: true, isVisible: false });
    const entries = treeEntries([hidden, b, c], false);
    expect(entries.map((e) => e.visible)).toEqual([false, false, true]);
  });

  it("keeps the relative order under one parent", () => {
    const d = layer(4, { parentID: id(1) });
    const e = layer(5, { parentID: id(1) });
    expect(names(treeEntries([e, a, c, b, d], false).map((x) => x.layer))).toEqual([
      "L1",
      "L5",
      "L3",
      "L4",
      "L2",
    ]);
  });

  it("does not visit children of a layer that is not a folder", () => {
    const child = layer(4, { parentID: id(2) });
    expect(names(treeEntries([b, child], false).map((e) => e.layer))).toEqual(["L2"]);
  });

  it("stops past 64 levels", () => {
    const chain = [layer(0, { isGroup: true })];
    for (let n = 1; n <= 66; n += 1) chain.push(layer(n, { isGroup: true, parentID: id(n - 1) }));
    const entries = treeEntries(chain, false);
    expect(entries).toHaveLength(65);
    expect(entries.at(-1)?.depth).toBe(64);
  });
});

describe("sortTreeOrder", () => {
  it("puts layers off the tree at the end in array order", () => {
    const orphan = layer(9, { parentID: id(99) });
    const a = layer(1, { isGroup: true });
    const b = layer(2);
    const c = layer(3, { parentID: id(1) });
    expect(names(sortTreeOrder([orphan, a, b, c]))).toEqual(["L1", "L3", "L2", "L9"]);
  });

  it("lists every layer once when ids repeat", () => {
    const a1 = layer(1, { isGroup: true });
    const a2 = layer(1, { isGroup: true });
    const c = layer(3, { parentID: id(1) });
    expect(sortTreeOrder([a1, a2, c])).toHaveLength(3);
  });
});
