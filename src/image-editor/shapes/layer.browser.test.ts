import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayerShapeStyle } from "../../comp/index";
import { validateLikeCompositor } from "../../comp/index";
import type { EditorApi, Layer, LayerId } from "../api";
import { patchLayer } from "../doc/commands/layers";
import type { DocStore } from "../doc/store";
import { applyUndo } from "../editor-api";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { rasterSize } from "../text/raster";
import { createShapeLayer, redrawAfterTransform, updateShapeLayer } from "./layer";
import { defaultShapeStyle, renderShape } from "./render";

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

async function mount() {
  const doc = makeDoc({ width: 400, height: 300, layers: [{}] });
  const m = await mountCanvas(doc, { [doc.manifest.layers[0].id]: WHITE });
  mounted.push(m.unmount);
  return m;
}

const layerOf = (api: EditorApi, id: LayerId) =>
  api.doc().manifest.layers.find((l) => l.id === id) as Layer;
const all = (api: EditorApi, id: LayerId) =>
  api.readRegion(id, "image", { x: 0, y: 0, ...rasterSize(api, id) });
const undo = (api: EditorApi, store: DocStore) =>
  applyUndo(api, store.undo() as NonNullable<ReturnType<DocStore["undo"]>>);

describe("shape layers", () => {
  it("creates each kind, validates, and undoes in one step", async () => {
    const { api, store } = await mount();
    for (const kind of ["Rectangle", "Ellipse", "Line"] as const) {
      const style: LayerShapeStyle =
        kind === "Line"
          ? { ...defaultShapeStyle(kind), start: [0, 0], end: [1, 1] }
          : defaultShapeStyle(kind);
      const id = createShapeLayer(api, { style, origin: [10, 20], size: [60.4, 40], name: kind });
      expect(layerOf(api, id).shape).toEqual(style);
      expect(layerOf(api, id).transform.size).toEqual([60, 40]);
      expect(validateLikeCompositor(api.doc().manifest)).toEqual([]);
      expect(all(api, id)).toEqual(renderShape(style, 60, 40).data);
      undo(api, store);
      expect(api.doc().manifest.layers.some((l) => l.id === id)).toBe(false);
    }
  });

  it("recolors in place under the same id", async () => {
    const { api, store } = await mount();
    const id = createShapeLayer(api, {
      style: defaultShapeStyle("Rectangle"),
      origin: [0, 0],
      size: [20, 20],
      name: "r",
    });
    const red = { ...defaultShapeStyle("Rectangle"), red: 1 };
    updateShapeLayer(api, id, red, "image.shape.change");
    expect(layerOf(api, id).shape).toEqual(red);
    expect(Array.from(all(api, id).slice(0, 4))).toEqual([255, 0, 0, 255]);
    undo(api, store);
    expect(Array.from(all(api, id).slice(0, 4))).toEqual([0, 0, 0, 255]);
  });

  it("redraws cleanly after a scale, and not after a rotation", async () => {
    const { api, store } = await mount();
    const style = { ...defaultShapeStyle("Rectangle"), cornerRadius: 10 };
    const id = createShapeLayer(api, { style, origin: [0, 0], size: [50, 40], name: "r" });
    const before = layerOf(api, id).transform;
    api.dispatch(patchLayer(id, { transform: { ...before, size: [100, 80] } }));
    redrawAfterTransform(id, before, api);
    expect(layerOf(api, id).id).toBe(id);
    expect(api.pixelSize(id, "image")).toEqual({ width: 100, height: 80 });
    expect(all(api, id)).toEqual(renderShape(style, 100, 80).data);
    undo(api, store);
    expect(api.pixelSize(id, "image")).toEqual({ width: 50, height: 40 });
    expect(all(api, id)).toEqual(renderShape(style, 50, 40).data);

    const t = layerOf(api, id).transform;
    api.dispatch(patchLayer(id, { transform: { ...t, rotation: 0.5 } }));
    const commit = vi.spyOn(api, "commit");
    redrawAfterTransform(id, t, api);
    expect(commit).not.toHaveBeenCalled();
    expect(layerOf(api, id).transform.size).toEqual(t.size);
  });
});
