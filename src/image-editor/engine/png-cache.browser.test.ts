import { afterEach, expect, it } from "vitest";
import { decodePng } from "../../comp/index";
import type { EditorApi, LayerId } from "../api";
import { applyUndo } from "../editor-api";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { createPngCache } from "./png-cache";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

const W = 8;
const H = 4;
const full = { x: 0, y: 0, width: W, height: H };

async function setup() {
  const doc = makeDoc({ width: W, height: H, layers: [{}] });
  const id = doc.manifest.layers[0].id;
  const m = await mountCanvas(doc);
  const cache = createPngCache(m.api, m.store);
  cleanups.push(m.unmount, () => cache.dispose());
  return { ...m, id, cache };
}

const pngOf = (api: EditorApi, id: LayerId) => {
  const image = api.doc().pixels.get(id)?.image;
  return image?.kind === "gpu" ? image.png : undefined;
};

function paint(api: EditorApi, id: LayerId, value: number) {
  const tiles = api.snapshotTiles(id, "image", full);
  api.writeRegion(id, "image", full, new Uint8Array(W * H * 4).fill(value));
  api.commit("image.notice.unsupported", api.doc(), tiles);
}

it("drops the png on commit and encodes the new pixels in the background", async () => {
  const { api, store, id, cache } = await setup();
  await cache.idle();
  expect(pngOf(api, id)).toBeDefined();
  paint(api, id, 90);
  const position = store.position();
  expect(pngOf(api, id)).toBeUndefined();
  await cache.idle();
  const png = pngOf(api, id);
  expect(png).toBeDefined();
  expect(decodePng(png!, "layer").data).toEqual(api.readRegion(id, "image", full));
  expect(store.position()).toBe(position); // the png went in without an undo step
});

it("keeps only the result of the last of two commits", async () => {
  const { api, id, cache } = await setup();
  await cache.idle();
  paint(api, id, 10);
  await Promise.resolve(); // the first job reads and starts
  paint(api, id, 200);
  await cache.idle();
  expect(decodePng(pngOf(api, id)!, "layer").data).toEqual(new Uint8Array(W * H * 4).fill(200));
});

it("encodes the pixels undo puts back", async () => {
  const { api, store, id, cache } = await setup();
  paint(api, id, 30);
  await cache.idle();
  paint(api, id, 60);
  await cache.idle();
  applyUndo(api, store.undo()!);
  await cache.idle();
  expect(decodePng(pngOf(api, id)!, "layer").data).toEqual(new Uint8Array(W * H * 4).fill(30));
});
