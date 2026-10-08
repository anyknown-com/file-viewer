import { describe, expect, it } from "vitest";
import type { AdjustmentSettings, Doc, Layer } from "../api";
import { makeDoc } from "../test/make-doc";
import {
  addMask,
  canvasSize,
  clipToBelow,
  crop,
  duplicateLayers,
  flipCanvas,
  groupLayers,
  insertLayer,
  moveLayers,
  patchLayer,
  releaseClip,
  removeLayers,
  rotateCanvas,
  setBlendMode,
  setMaskLinked,
  setTransform,
  ungroup,
} from "./commands";
import { layerMatrixOf } from "./layer-matrix";
import { MAX_DEPTH, subtreeRange } from "./tree";

const id = (n: number): string => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ids = (doc: Doc): string[] => doc.manifest.layers.map((l) => l.id);
const layer = (doc: Doc, n: number): Layer | undefined =>
  doc.manifest.layers.find((l) => l.id === id(n));
const invert: AdjustmentSettings = {
  kind: "Invert",
  hue: 0,
  saturation: 0,
  lightness: 0,
  colorize: false,
  levels: { channel: "RGB", ranges: [] },
  curves: { channel: "RGB", channels: [] },
};
const transform = (x: number, y: number, w: number, h: number): Layer["transform"] => ({
  origin: [x, y],
  size: [w, h],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality",
});

// [1] bottom, [2] folder { [3] in, [4] in }, [5] top
function folderDoc(): Doc {
  return makeDoc({
    width: 100,
    height: 80,
    layers: [
      { id: id(1) },
      { id: id(2), isGroup: true },
      { id: id(3), parentID: id(2) },
      { id: id(4), parentID: id(2) },
      { id: id(5) },
    ],
  });
}

describe("groups", () => {
  it("groups and ungroups back to the original array", () => {
    const doc = makeDoc({
      width: 10,
      height: 10,
      layers: [1, 2, 3, 4].map((n) => ({ id: id(n) })),
    });
    const grouped = groupLayers([id(2), id(3)], id(9), "Folder 1")(doc);
    expect(ids(grouped)).toEqual([id(1), id(9), id(2), id(3), id(4)]);
    expect(layer(grouped, 9)?.transform.size).toEqual([10, 10]);
    expect(grouped.manifest.activeLayerID).toBe(id(9));
    expect(ungroup(id(9))(grouped).manifest.layers).toEqual(doc.manifest.layers);
  });
});

describe("moveLayers", () => {
  it("keeps the folder a contiguous subtree after moving a layer into it", () => {
    const moved = moveLayers([id(5)], { parent: id(2), index: 1 })(folderDoc());
    expect(ids(moved)).toEqual([id(1), id(2), id(3), id(5), id(4)]);
    expect(layer(moved, 5)?.parentID).toBe(id(2));
    expect(subtreeRange(moved.manifest, id(2))).toEqual([1, 5]);
  });

  it("refuses to move a folder into itself or its own contents", () => {
    const doc = folderDoc();
    expect(moveLayers([id(2)], { parent: id(2), index: 0 })(doc)).toBe(doc);
    const nested = moveLayers([id(6)], { parent: id(2), index: 0 })(
      insertLayer({ ...doc.manifest.layers[1], id: id(6) }, id(4))(doc),
    );
    expect(moveLayers([id(2)], { parent: id(6), index: 0 })(nested)).toBe(nested);
  });

  it("refuses to nest deeper than 64 levels", () => {
    const layers: Partial<Layer>[] = [];
    for (let i = 0; i < MAX_DEPTH; i++) {
      layers.push({ id: id(i + 1), isGroup: true, ...(i > 0 ? { parentID: id(i) } : {}) });
    }
    layers.push({ id: id(100), isGroup: true }, { id: id(101), parentID: id(100) });
    const doc = makeDoc({ width: 4, height: 4, layers });
    // The deepest folder is at depth 63; a folder holding a layer would put that layer at 65.
    expect(moveLayers([id(100)], { parent: id(MAX_DEPTH), index: 0 })(doc)).toBe(doc);
    expect(moveLayers([id(101)], { parent: id(MAX_DEPTH), index: 0 })(doc)).not.toBe(doc);
  });
});

describe("layers", () => {
  it("drops clipping onto a deleted base", () => {
    const doc = makeDoc({
      width: 4,
      height: 4,
      layers: [
        { id: id(1) },
        { id: id(2), maskSourceID: id(1) },
        { id: id(3), maskSourceID: id(1) },
      ],
    });
    const next = removeLayers([id(1)])(doc);
    expect(ids(next)).toEqual([id(2), id(3)]);
    expect(next.manifest.layers.every((l) => !("maskSourceID" in l))).toBe(true);
    expect(next.pixels.has(id(1))).toBe(false);
  });

  it("refuses a blend mode other than Normal on a folder", () => {
    const doc = folderDoc();
    expect(setBlendMode(id(2), "Multiply")(doc)).toBe(doc);
    expect(layer(setBlendMode(id(3), "Multiply")(doc), 3)?.blendMode).toBe("Multiply");
  });

  it("inserts above a folder's whole subtree, in the folder's parent", () => {
    const doc = folderDoc();
    const nested = insertLayer(
      { ...doc.manifest.layers[0], id: id(6), parentID: id(2) },
      id(2),
    )(doc);
    expect(ids(nested)).toEqual([id(1), id(2), id(3), id(4), id(6), id(5)]);
    expect(layer(nested, 6)?.parentID).toBeUndefined();
    expect(nested.manifest.activeLayerID).toBe(id(6));
    expect(nested.pixels.get(id(6))).toEqual({ image: { kind: "gpu" } });
    const inside = insertLayer({ ...doc.manifest.layers[0], id: id(7) }, id(3))(doc);
    expect(ids(inside)).toEqual([id(1), id(2), id(3), id(7), id(4), id(5)]);
    expect(layer(inside, 7)?.parentID).toBe(id(2));
  });

  it("inserts at the top of the root with no anchor; pixels follow the layer kind", () => {
    const doc = folderDoc();
    const base = doc.manifest.layers[0];
    const adjust = insertLayer({ ...base, id: id(6), adjustment: invert }, null)(doc);
    expect(ids(adjust).at(-1)).toBe(id(6));
    expect(adjust.pixels.has(id(6))).toBe(false);
    const masked = insertLayer(
      { ...base, id: id(7), adjustment: invert, maskFile: `${id(7)}.mask.png` },
      null,
    )(doc);
    expect(masked.pixels.get(id(7))).toEqual({ mask: { kind: "gpu" } });
  });

  it("makes the next lower sibling active when the active layer is deleted", () => {
    const doc = folderDoc();
    const active = { ...doc, manifest: { ...doc.manifest, activeLayerID: id(4) } };
    expect(removeLayers([id(4)])(active).manifest.activeLayerID).toBe(id(3));
    const lowest = { ...doc, manifest: { ...doc.manifest, activeLayerID: id(3) } };
    expect("activeLayerID" in removeLayers([id(3)])(lowest).manifest).toBe(false);
    const folder = removeLayers([id(2)])({
      ...doc,
      manifest: { ...doc.manifest, activeLayerID: id(2) },
    });
    expect(ids(folder)).toEqual([id(1), id(5)]);
    expect(folder.manifest.activeLayerID).toBe(id(1));
  });

  it("drops keys patched to undefined", () => {
    const doc = makeDoc({
      width: 4,
      height: 4,
      layers: [{ id: id(1), text: {} as Layer["text"] }],
    });
    const next = patchLayer(id(1), { text: undefined })(doc);
    expect("text" in (layer(next, 1) as Layer)).toBe(false);
    expect(patchLayer(id(9), { name: "x" })(doc)).toBe(doc);
  });

  it("duplicates a folder with its contents just above it", () => {
    const map = new Map([
      [id(2), id(12)],
      [id(3), id(13)],
      [id(4), id(14)],
    ]);
    const next = duplicateLayers([id(2)], map)(folderDoc());
    expect(ids(next)).toEqual([id(1), id(2), id(3), id(4), id(12), id(13), id(14), id(5)]);
    expect(layer(next, 13)?.parentID).toBe(id(12));
    expect(layer(next, 12)?.parentID).toBeUndefined();
    expect(next.pixels.get(id(13))).toEqual({ image: { kind: "gpu" } });
  });
});

describe("clip", () => {
  it("clips to the base of the stack below and releases from there up", () => {
    let doc = makeDoc({ width: 4, height: 4, layers: [1, 2, 3].map((n) => ({ id: id(n) })) });
    doc = clipToBelow(id(2))(doc);
    doc = clipToBelow(id(3))(doc);
    expect(layer(doc, 3)?.maskSourceID).toBe(id(1));
    expect(layer(releaseClip(id(3))(doc), 2)?.maskSourceID).toBe(id(1));
    const released = releaseClip(id(2))(doc);
    expect(layer(released, 3)?.maskSourceID).toBeUndefined();
  });

  it("does not clip to a folder or an adjustment layer", () => {
    const doc = makeDoc({
      width: 4,
      height: 4,
      layers: [{ id: id(1), adjustment: invert }, { id: id(2) }],
    });
    expect(clipToBelow(id(2))(doc)).toBe(doc);
    const folder = folderDoc();
    expect(clipToBelow(id(5))(folder)).toBe(folder);
  });
});

describe("geometry", () => {
  it("shifts every layer by the crop corner and leaves pixels alone", () => {
    const doc = makeDoc({
      width: 100,
      height: 80,
      layers: [
        { id: id(1) },
        {
          id: id(2),
          transform: transform(30, 40, 10, 10),
          maskFile: "m",
          maskPlacement: transform(5, 5, 2, 2),
        },
      ],
    });
    const next = crop({ x: 10, y: 20, width: 50, height: 40 })(doc);
    expect([next.manifest.width, next.manifest.height]).toEqual([50, 40]);
    expect(layer(next, 1)?.transform.origin).toEqual([-10, -20]);
    expect(layer(next, 2)?.transform.origin).toEqual([20, 20]);
    expect(layer(next, 2)?.maskPlacement?.origin).toEqual([-5, -15]);
    expect(next.pixels).toBe(doc.pixels);
  });

  it("anchors a canvas resize at each of the nine points", () => {
    const doc = makeDoc({ width: 10, height: 10, layers: [{ id: id(1) }] });
    const shifts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
      (a) => layer(canvasSize(20, 15, a as 0)(doc), 1)?.transform.origin,
    );
    expect(shifts).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [0, 2],
      [5, 2],
      [10, 2],
      [0, 5],
      [5, 5],
      [10, 5],
    ]);
  });

  it("turns twice to where flipping both ways puts each layer", () => {
    const doc = makeDoc({
      width: 100,
      height: 60,
      layers: [
        { id: id(1), transform: { ...transform(10, 5, 30, 20), rotation: 20, flipX: true } },
      ],
    });
    const turned = rotateCanvas(90)(rotateCanvas(90)(doc));
    const flipped = flipCanvas("y")(flipCanvas("x")(doc));
    const t = layer(turned, 1)?.transform as Layer["transform"];
    const f = layer(flipped, 1)?.transform as Layer["transform"];
    expect([turned.manifest.width, turned.manifest.height]).toEqual([100, 60]);
    expect(t.origin).toEqual(f.origin);
    expect(t.size).toEqual(f.size);
    const px = { width: 30, height: 20 };
    const mt = layerMatrixOf(t, px);
    const mf = layerMatrixOf(f, px);
    mt.forEach((v, i) => expect(v).toBeCloseTo(mf[i], 9));
  });

  it("stores the mask placement on unlink and leaves the mask behind on later moves", () => {
    let doc = makeDoc({
      width: 100,
      height: 80,
      layers: [{ id: id(1), transform: transform(10, 10, 20, 20) }],
    });
    doc = addMask(id(1), "white")(doc);
    expect(layer(doc, 1)?.maskFile).toBe(`${id(1)}.mask.png`);
    expect(doc.pixels.get(id(1))?.mask).toEqual({ kind: "gpu" });
    doc = setMaskLinked(id(1), false)(doc);
    expect(layer(doc, 1)?.maskPlacement).toEqual(transform(10, 10, 20, 20));
    doc = setTransform(id(1), transform(40, 40, 20, 20))(doc);
    expect(layer(doc, 1)?.maskPlacement).toEqual(transform(10, 10, 20, 20));
    doc = setMaskLinked(id(1), true)(doc);
    expect(layer(doc, 1)?.maskPlacement).toBeUndefined();
  });

  it("carries a linked mask placement along with the layer", () => {
    const doc = makeDoc({
      width: 100,
      height: 80,
      layers: [
        {
          id: id(1),
          transform: transform(10, 10, 20, 20),
          maskFile: "m",
          maskPlacement: transform(0, 0, 5, 5),
        },
      ],
    });
    const next = setTransform(id(1), transform(15, 30, 20, 20))(doc);
    expect(layer(next, 1)?.maskPlacement?.origin).toEqual([5, 20]);
  });
});
