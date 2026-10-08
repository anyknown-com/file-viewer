import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { Layer } from "../api";
import { undo } from "../layer-ops";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { openImageSizeDialog, resizeImage } from "./image-size-dialog";

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
  sampling: "High quality",
});

async function mount(layers: number) {
  const doc = makeDoc({
    width: 40,
    height: 30,
    layers: Array.from({ length: layers }, () => ({ transform: box(0, 0, 40, 30) })),
  });
  const m = await mountCanvas(doc);
  mounted.push(m.unmount);
  return m;
}

it("keeps the proportions while locked", async () => {
  const { api } = await mount(1);
  openImageSizeDialog(api);
  await page.getByRole("textbox", { name: "Width" }).fill("80");
  await expect.element(page.getByRole("textbox", { name: "Height" })).toHaveValue("60");
  await page.getByRole("textbox", { name: "Height" }).fill("15");
  await expect.element(page.getByRole("textbox", { name: "Width" })).toHaveValue("20");
});

it("does nothing past the pixel budget and says so", async () => {
  // Five 8000 × 6000 layers are 240 MP, over the 200 MP budget, each under the texture limit.
  const { api, store } = await mount(5);
  const before = store.get();
  openImageSizeDialog(api);
  await page.getByRole("textbox", { name: "Width" }).fill("8000");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  expect(store.get()).toBe(before);
  expect(api.pixelSize(before.manifest.layers[0].id, "image")).toEqual({ width: 40, height: 30 });
});

it("resamples every layer and mask and scales the transforms, one undo step", async () => {
  const { api, store } = await mount(2);
  const [a, b] = store.get().manifest.layers;
  api.resizePixels(b.id, "mask", { width: 40, height: 30 }, { pixels: new Uint8Array(1200) });
  const position = store.position();
  expect(resizeImage(api, 20, 15)).toBeNull();
  expect(store.position()).toBe(position + 1);
  const m = store.get().manifest;
  expect([m.width, m.height]).toEqual([20, 15]);
  expect(m.layers[0].transform).toMatchObject({ origin: [0, 0], size: [20, 15] });
  expect(api.pixelSize(a.id, "image")).toEqual({ width: 20, height: 15 });
  expect(api.pixelSize(b.id, "mask")).toEqual({ width: 20, height: 15 });
  undo(api);
  expect(store.get().manifest.width).toBe(40);
  expect(api.pixelSize(a.id, "image")).toEqual({ width: 40, height: 30 });
  expect(api.pixelSize(b.id, "mask")).toEqual({ width: 40, height: 30 });
});
