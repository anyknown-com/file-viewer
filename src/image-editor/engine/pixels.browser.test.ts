import { afterEach, describe, expect, it } from "vitest";
import type { Doc } from "../api";
import { insertLayer, patchLayer } from "../doc/commands/layers";
import { resizedTransform } from "../doc/layer-matrix";
import { applyUndo } from "../editor-api";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

async function mount(doc: Doc) {
  const m = await mountCanvas(doc);
  mounted.push(m.unmount);
  return m;
}

const pattern = (n: number, bpp: number) =>
  Uint8Array.from({ length: n * bpp }, (_, i) => (i * 37 + 11) % 256);
const apply = (m: readonly number[], x: number, y: number) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

describe("pixels", () => {
  it("reads back what writeRegion wrote, colors of translucent pixels included", async () => {
    const doc = makeDoc({ width: 8, height: 8, layers: [{}] });
    const id = doc.manifest.layers[0].id;
    const { api } = await mount(doc);
    const rect = { x: 2, y: 1, width: 5, height: 3 };
    const image = pattern(15, 4);
    for (let i = 3; i < image.length; i += 4) image[i] = 1 + ((i * 7) % 254);
    api.writeRegion(id, "image", rect, image);
    expect(api.readRegion(id, "image", rect)).toEqual(image);
    const mask = pattern(15, 1);
    api.writeRegion(id, "mask", rect, mask);
    expect(api.readRegion(id, "mask", rect)).toEqual(mask);
  });

  it("snapshots tiles on the 256 grid", async () => {
    const doc = makeDoc({ width: 600, height: 300, layers: [{}] });
    const id = doc.manifest.layers[0].id;
    const { api } = await mount(doc);
    const tiles = api.snapshotTiles(id, "image", { x: 200, y: 100, width: 200, height: 200 });
    expect(tiles.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
      [0, 0, 256, 256],
      [256, 0, 256, 256],
      [0, 256, 256, 44],
      [256, 256, 256, 44],
    ]);
    expect(tiles[3].before).toHaveLength(256 * 44 * 4);
  });

  it("undoes and redoes a committed write", async () => {
    const doc = makeDoc({ width: 300, height: 20, layers: [{}] });
    const id = doc.manifest.layers[0].id;
    const { api, store } = await mount(doc);
    const rect = { x: 250, y: 5, width: 20, height: 10 };
    const before = api.readRegion(id, "image", rect);
    const tiles = api.snapshotTiles(id, "image", rect);
    const after = pattern(200, 4);
    api.writeRegion(id, "image", rect, after);
    api.commit("image.notice.unsupported", api.doc(), tiles);
    expect(api.doc().pixels.get(id)?.image).toEqual({ kind: "gpu" });
    applyUndo(api, store.undo() as NonNullable<ReturnType<typeof store.undo>>);
    expect(api.readRegion(id, "image", rect)).toEqual(before);
    applyUndo(api, store.redo() as NonNullable<ReturnType<typeof store.redo>>);
    expect(api.readRegion(id, "image", rect)).toEqual(after);
  });

  it("reads the composite of two Normal layers", async () => {
    const doc = makeDoc({ width: 2, height: 1, layers: [{}, { opacity: 0.5 }] });
    const [a, b] = doc.manifest.layers;
    const m = await mountCanvas(doc, { [a.id]: [255, 0, 0, 255], [b.id]: [0, 0, 255, 255] });
    mounted.push(m.unmount);
    const out = Array.from(m.api.readComposite({ x: 0, y: 0, width: 1, height: 1 }));
    out.forEach((v, i) => expect(Math.abs(v - [128, 0, 128, 255][i])).toBeLessThanOrEqual(1));
  });

  it("checks the pixel budget", async () => {
    const { api } = await mount(makeDoc({ width: 2, height: 2, layers: [{}] }));
    expect(api.checkBudget({ layerPx: 1 })).toBeNull();
    expect(api.checkBudget({ maskPx: 1e12 })?.code).toBe("too_large");
  });

  it("knows a layer's pixel size once it has pixels", async () => {
    const doc = makeDoc({ width: 50, height: 40, layers: [{}] });
    const { api } = await mount(doc);
    const record = { ...makeDoc({ width: 50, height: 40, layers: [{}] }).manifest.layers[0] };
    record.transform = { ...record.transform, size: [30, 20] };
    api.dispatch(insertLayer(record, null), "image.notice.unsupported");
    expect(api.pixelSize(record.id, "image")).toBeNull();
    api.writeRegion(record.id, "image", { x: 0, y: 0, width: 1, height: 1 }, new Uint8Array(4));
    expect(api.pixelSize(record.id, "image")).toEqual({ width: 30, height: 20 });
  });

  it("resizes pixels, undoes and redoes the resize", async () => {
    const doc = makeDoc({ width: 100, height: 50, layers: [{}] });
    const id = doc.manifest.layers[0].id;
    const { api, store } = await mount(doc);
    const old = api.readRegion(id, "image", { x: 0, y: 0, width: 100, height: 50 });
    const m1 = api.layerMatrix(id);
    const from = { width: 100, height: 50 };
    const to = { width: 140, height: 80 };
    const offset = { x: 20, y: 10 };
    const resize = api.resizePixels(id, "image", to, { offset });
    const t = resizedTransform(api.doc().manifest.layers[0].transform, from, to, offset);
    const next = patchLayer(id, { transform: t })(api.doc());
    expect(api.pixelSize(id, "image")).toEqual(to);
    expect(api.readRegion(id, "image", { x: 20, y: 10, width: 100, height: 50 })).toEqual(old);
    expect(api.readRegion(id, "image", { x: 0, y: 0, width: 1, height: 1 })).toEqual(
      new Uint8Array(4),
    );
    api.commit("image.notice.unsupported", next, [], [resize]);
    const m2 = api.layerMatrix(id);
    const [x1, y1] = apply(m1, 33.5, 21.5);
    const [x2, y2] = apply(m2, 33.5, 21.5);
    expect(x2 - x1).toBeCloseTo(20, 6);
    expect(y2 - y1).toBeCloseTo(10, 6);
    applyUndo(api, store.undo() as NonNullable<ReturnType<typeof store.undo>>);
    expect(api.pixelSize(id, "image")).toEqual(from);
    expect(api.readRegion(id, "image", { x: 0, y: 0, ...from })).toEqual(old);
    applyUndo(api, store.redo() as NonNullable<ReturnType<typeof store.redo>>);
    expect(api.pixelSize(id, "image")).toEqual(to);
  });

  it("fills a grown mask with its edge majority and takes given pixels whole", async () => {
    const doc = makeDoc({ width: 4, height: 4, layers: [{}] });
    const id = doc.manifest.layers[0].id;
    const { api } = await mount(doc);
    api.writeRegion(id, "mask", { x: 0, y: 0, width: 4, height: 4 }, new Uint8Array(16));
    api.resizePixels(id, "mask", { width: 6, height: 6 }, { offset: { x: 1, y: 1 } });
    expect(api.readRegion(id, "mask", { x: 0, y: 0, width: 6, height: 6 })).toEqual(
      new Uint8Array(36),
    );
    const given = pattern(9, 1);
    api.resizePixels(id, "mask", { width: 3, height: 3 }, { pixels: given });
    expect(api.readRegion(id, "mask", { x: 0, y: 0, width: 3, height: 3 })).toEqual(given);
    expect(() => api.resizePixels(id, "image", { width: 40_000, height: 1 })).toThrow(
      expect.objectContaining({ code: "too_large" }),
    );
  });

  it("creates a missing mask at its maskPlacement, pixel (0, 0) at the placement's corner", async () => {
    const doc = makeDoc({ width: 8, height: 8, layers: [{}] });
    const layer = doc.manifest.layers[0];
    layer.maskFile = `${layer.id}.mask.png`;
    layer.maskPlacement = { ...layer.transform, origin: [-2, -1], size: [12, 10] };
    const { api } = await mount(doc);
    // Mask pixel (2, 1) lies on document pixel (0, 0).
    api.writeRegion(layer.id, "mask", { x: 2, y: 1, width: 1, height: 1 }, Uint8Array.of(0));
    expect(api.pixelSize(layer.id, "mask")).toEqual({ width: 12, height: 10 });
    expect([...api.readRegion(layer.id, "mask", { x: 1, y: 1, width: 2, height: 1 })]).toEqual([
      255, 0,
    ]);
    expect([...api.readRegion(layer.id, "mask", { x: 11, y: 9, width: 1, height: 1 })]).toEqual([
      255,
    ]);
    const out = api.readComposite({ x: 0, y: 0, width: 2, height: 1 });
    expect([out[3], out[7]]).toEqual([0, 255]);
  });
});
