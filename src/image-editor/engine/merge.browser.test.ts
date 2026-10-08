import { afterEach, expect, it } from "vitest";
import type { EditorApi, Layer } from "../api";
import { undo } from "../layer-ops";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { canMergeDown, mergeDown, mergeFolder } from "./merge";

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  resetRegistry();
});

const box = (x: number, y: number, w: number, h: number): Layer["transform"] => ({
  origin: [x, y],
  size: [w, h],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "Nearest",
});
const composite = (api: EditorApi) => {
  const { width, height } = api.doc().manifest;
  return api.readComposite({ x: 0, y: 0, width, height });
};
function maxDiff(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}

it("merges a Multiply layer down without changing the picture, undo brings both back", async () => {
  const doc = makeDoc({
    width: 8,
    height: 6,
    layers: [
      { id: "BG", transform: box(0, 0, 8, 6) },
      // Past the canvas's right and bottom edges.
      { id: "UP", blendMode: "Multiply", transform: box(5, 3, 4, 4) },
    ],
  });
  const m = await mountCanvas(doc, { BG: [200, 120, 40, 255], UP: [100, 200, 250, 255] });
  mounted.push(m.unmount);
  const before = composite(m.api);
  const bg = m.api.readRegion("BG", "image", { x: 0, y: 0, width: 8, height: 6 });
  expect(canMergeDown(m.api, "UP")).toBe(true);
  expect(canMergeDown(m.api, "BG")).toBe(false);

  const position = m.store.position();
  mergeDown(m.api, "UP");
  expect(m.store.position()).toBe(position + 1);
  const layers = m.api.doc().manifest.layers;
  expect(layers.map((l) => l.id)).toEqual(["BG"]);
  expect(layers[0].transform.size).toEqual([9, 7]);
  expect(m.api.pixelSize("BG", "image")).toEqual({ width: 9, height: 7 });
  expect(m.api.session().active).toBe("BG");
  expect(maxDiff(composite(m.api), before)).toBeLessThanOrEqual(1);

  undo(m.api);
  expect(m.api.doc().manifest.layers.map((l) => l.id)).toEqual(["BG", "UP"]);
  expect([...m.api.readRegion("BG", "image", { x: 0, y: 0, width: 8, height: 6 })]).toEqual([
    ...bg,
  ]);
  expect(maxDiff(composite(m.api), before)).toBe(0);
});

it("merges a folder into one layer without changing the picture", async () => {
  const doc = makeDoc({
    width: 8,
    height: 6,
    layers: [
      { id: "BG", transform: box(0, 0, 8, 6) },
      { id: "F", name: "Folder", isGroup: true },
      { id: "A", parentID: "F", transform: box(1, 1, 6, 4) },
      { id: "B", parentID: "F", blendMode: "Multiply", transform: box(3, 1, 4, 4) },
    ],
  });
  const colors = {
    BG: [30, 60, 90, 255],
    A: [250, 200, 100, 255],
    B: [128, 255, 64, 255],
  } as const;
  const m = await mountCanvas(doc, {
    BG: [...colors.BG],
    A: [...colors.A],
    B: [...colors.B],
  });
  mounted.push(m.unmount);
  const before = composite(m.api);

  mergeFolder(m.api, "F");
  const layers = m.api.doc().manifest.layers;
  expect(layers).toHaveLength(2);
  expect(layers[0].id).toBe("BG");
  expect(layers[1].name).toBe("Folder");
  expect(layers[1].isGroup ?? false).toBe(false);
  expect(layers[1].parentID).toBeUndefined();
  expect(layers[1].transform).toMatchObject({ origin: [1, 1], size: [6, 4] });
  expect(m.api.doc().pixels.get(layers[1].id)?.image).toEqual({ kind: "gpu" });
  expect(maxDiff(composite(m.api), before)).toBeLessThanOrEqual(1);

  undo(m.api);
  expect(m.api.doc().manifest.layers.map((l) => l.id)).toEqual(["BG", "F", "A", "B"]);
  expect(maxDiff(composite(m.api), before)).toBe(0);
});
