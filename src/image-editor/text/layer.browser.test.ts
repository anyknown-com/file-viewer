import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayerTextStyle } from "../../comp/index";
import { validateLikeCompositor } from "../../comp/index";
import type { EditorApi, Layer, LayerId } from "../api";
import { insertLayer, patchLayer } from "../doc/commands/layers";
import type { DocStore } from "../doc/store";
import { applyUndo } from "../editor-api";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { canvasMeasure } from "./fonts";
import { createTextLayer, resizeTextBox, updateTextLayer } from "./layer";
import { layoutText } from "./layout";
import { rasterSize } from "./raster";
import { renderText } from "./render";
import { defaultTextStyle } from "./style";

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
const redo = (api: EditorApi, store: DocStore) =>
  applyUndo(api, store.redo() as NonNullable<ReturnType<DocStore["redo"]>>);
const style = (content: string, patch: Partial<LayerTextStyle> = {}): LayerTextStyle => ({
  ...defaultTextStyle(content),
  ...patch,
});

describe("text layers", () => {
  it("creates a text layer that validates and undoes in one step", async () => {
    const { api, store } = await mount();
    const s = style("Hello", {
      colorRuns: [{ location: 1, length: 2, red: 1, green: 0, blue: 0 }],
    });
    const id = await createTextLayer(api, { style: s, origin: [20, 30] });
    expect(layerOf(api, id).text).toEqual(s);
    expect(layerOf(api, id).transform.origin).toEqual([20, 30]);
    expect(api.session().active).toBe(id);
    expect(validateLikeCompositor(api.doc().manifest)).toEqual([]);
    expect(all(api, id)).toEqual(renderText(s).data);
    undo(api, store);
    expect(api.doc().manifest.layers.some((l) => l.id === id)).toBe(false);
    redo(api, store);
    expect(layerOf(api, id).text).toEqual(s);
  });

  it("falls back to the rounded transform size without a texture", async () => {
    const { api } = await mount();
    const id = crypto.randomUUID().toUpperCase();
    const transform = { ...api.doc().manifest.layers[0].transform, size: [10.4, 20.6] };
    api.dispatch(insertLayer({ id, name: "x", isVisible: true, transform } as Layer, null));
    expect(api.pixelSize(id, "image")).toBeNull();
    expect(rasterSize(api, id)).toEqual({ width: 10, height: 21 });
  });

  it("re-renders at a new size under the same id, undoable in one step", async () => {
    const { api, store } = await mount();
    const id = await createTextLayer(api, { style: style("Hi"), origin: [0, 0] });
    const before = { size: rasterSize(api, id), data: all(api, id) };
    const s = style("Hello there, wider");
    await updateTextLayer(api, id, s, "image.text.edit");
    const r = renderText(s);
    expect(r.width).toBeGreaterThan(before.size.width);
    expect(api.doc().manifest.layers.filter((l) => l.text)).toHaveLength(1);
    expect(api.pixelSize(id, "image")).toEqual({ width: r.width, height: r.height });
    expect(layerOf(api, id).transform.size).toEqual([r.width, r.height]);
    expect(layerOf(api, id).name).toBe("Hello there, wider");
    expect(all(api, id)).toEqual(r.data);
    undo(api, store);
    expect(api.pixelSize(id, "image")).toEqual(before.size);
    expect(layerOf(api, id).transform.size).toEqual([before.size.width, before.size.height]);
    expect(all(api, id)).toEqual(before.data);
    redo(api, store);
    expect(api.pixelSize(id, "image")).toEqual({ width: r.width, height: r.height });
    expect(all(api, id)).toEqual(r.data);
  });

  it("writes in place when only the color changes", async () => {
    const { api } = await mount();
    const id = await createTextLayer(api, { style: style("Same"), origin: [0, 0] });
    const spy = vi.spyOn(api, "resizePixels");
    const s = style("Same", { red: 1 });
    await updateTextLayer(api, id, s, "image.text.edit");
    expect(spy).not.toHaveBeenCalled();
    expect(layerOf(api, id).text?.red).toBe(1);
    expect(all(api, id)).toEqual(renderText(s).data);
  });

  it("pins a mask that covered the old transform", async () => {
    const { api } = await mount();
    const id = await createTextLayer(api, { style: style("Hi"), origin: [5, 5] });
    api.dispatch(patchLayer(id, { maskFile: `${id}-mask.png` }), "image.text.edit");
    const size = rasterSize(api, id);
    const rect = { x: 0, y: 0, ...size };
    const mask = Uint8Array.from({ length: size.width * size.height }, (_, i) => (i * 7) % 256);
    api.writeRegion(id, "mask", rect, mask);
    const old = layerOf(api, id).transform;
    await updateTextLayer(api, id, style("Hi there, wider"), "image.text.edit");
    expect(layerOf(api, id).maskPlacement).toEqual(old);
    expect(layerOf(api, id).transform.size).not.toEqual(old.size);
    expect(api.readRegion(id, "mask", rect)).toEqual(mask);
  });

  it("reflows a paragraph box without changing the font size", async () => {
    const { api } = await mount();
    const s = style("Hello world again and again", { boxSize: [700, 200], fontSize: 32 });
    const id = await createTextLayer(api, { style: s, origin: [0, 0] });
    const lines = () => {
      const ctx = new OffscreenCanvas(1, 1).getContext("2d") as OffscreenCanvasRenderingContext2D;
      return layoutText(layerOf(api, id).text as LayerTextStyle, canvasMeasure(ctx)).lines.length;
    };
    expect(lines()).toBe(1);
    await resizeTextBox(api, id, [150, 200], [10, 20]);
    expect(lines()).toBeGreaterThan(1);
    const layer = layerOf(api, id);
    expect(layer.text?.fontSize).toBe(32);
    expect(layer.text?.boxSize).toEqual([150, 200]);
    expect(layer.transform.size).toEqual([150, 200]);
    expect(layer.transform.origin).toEqual([10, 20]);
  });

  it("keeps clipping on a text layer used as maskSourceID", async () => {
    const { api } = await mount();
    const textId = await createTextLayer(api, {
      style: style("Hi", { fontSize: 24 }),
      origin: [0, 0],
    });
    const top = crypto.randomUUID().toUpperCase();
    const transform = { ...api.doc().manifest.layers[0].transform };
    api.dispatch(
      insertLayer(
        { id: top, name: "top", isVisible: true, transform, maskSourceID: textId },
        textId,
      ),
      "image.text.edit",
    );
    const fill = new Uint8Array(400 * 300 * 4);
    for (let i = 0; i < fill.length; i += 4) fill.set([0, 0, 255, 255], i);
    api.writeRegion(top, "image", { x: 0, y: 0, width: 400, height: 300 }, fill);
    await updateTextLayer(
      api,
      textId,
      style("Hi there, much wider", { fontSize: 24 }),
      "image.text.edit",
    );
    expect(layerOf(api, top).maskSourceID).toBe(textId);
    const [w, h] = layerOf(api, textId).transform.size;
    expect(w).toBeLessThan(390);
    expect(h).toBeLessThan(290);
    expect([...api.readComposite({ x: 395, y: 295, width: 1, height: 1 })]).toEqual(WHITE);
  });

  it("refuses to re-render with a missing font", async () => {
    const { api } = await mount();
    const id = await createTextLayer(api, { style: style("Hi"), origin: [0, 0] });
    const s = style("Hi", { fontName: "Helvetica-Bold" });
    api.dispatch(patchLayer(id, { text: s }), "image.text.edit");
    const doc = api.doc();
    const data = all(api, id);
    await expect(updateTextLayer(api, id, s, "image.text.edit")).rejects.toThrow("missing fonts");
    expect(api.doc()).toBe(doc);
    expect(all(api, id)).toEqual(data);
  });
});
