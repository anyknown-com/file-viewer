import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ViewerError } from "../../../contract/errors";
import type { EditorApi, Layer } from "../../api";
import { resetRegistry, tools } from "../../registry";
import { isMac } from "../../shortcut";
import { makeDoc } from "../../test/make-doc";
import { mountEditor } from "../../test/mount-editor";
import { registerSelectPaint } from "../register";
import { writeSelection } from "../select/mask";
import { setToolState, toolState } from "../state";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

type RGBA = [number, number, number, number];
const WHITE: RGBA = [255, 255, 255, 255];
const RED: RGBA = [255, 0, 0, 255];
const BLACK: RGBA = [0, 0, 0, 255];
const tick = () => new Promise((r) => setTimeout(r, 0));
const mod = isMac() ? { metaKey: true } : { ctrlKey: true };
const key = (k: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.body, { key: k, ...init });
const px = (
  api: EditorApi,
  id: string,
  x: number,
  y: number,
  target: "image" | "mask" = "image",
) => [...api.readRegion(id, target, { x, y, width: 1, height: 1 })];
const docPx = (api: EditorApi, x: number, y: number) => [
  ...api.readComposite({ x, y, width: 1, height: 1 }),
];
const box = (origin: [number, number], size: [number, number]): Layer["transform"] => ({
  origin,
  size,
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality",
});

async function setup(layer: Partial<Layer> = {}, color: RGBA = WHITE, size = 256) {
  await page.viewport(1400, 900);
  const doc = makeDoc({ width: size, height: size, layers: [layer] });
  const id = doc.manifest.layers[0]!.id;
  const m = await mountEditor(doc, { [id]: color });
  mounted.push(m.unmount);
  m.api.setSession({ tool: "paint.brush" });
  setToolState(m.api, { brush: { ...toolState(m.api).brush, size: 10 } });
  return { ...m, id };
}

async function stroke(api: EditorApi, pts: [number, number][], tool = "paint.brush") {
  const t = tools().find((x) => x.id === tool)!;
  const at = ([x, y]: [number, number]) => ({ x, y });
  t.onPointerDown?.(at(pts[0]!), new PointerEvent("pointerdown"), api);
  for (const p of pts.slice(1)) t.onPointerMove?.(at(p), new PointerEvent("pointermove"), api);
  t.onPointerUp?.(at(pts.at(-1)!), new PointerEvent("pointerup"), api);
  await tick();
}

it("paints the foreground color along a stroke in one undo step", async () => {
  const { api, id, store } = await setup();
  const pos = store.position();
  await stroke(api, [
    [40, 128],
    [120, 128],
    [200, 128],
  ]);
  expect(px(api, id, 128, 128)).toEqual(BLACK);
  expect(px(api, id, 128, 60)).toEqual(WHITE);
  expect(store.position()).toBe(pos + 1);
  key("z", mod);
  expect(px(api, id, 128, 128)).toEqual(WHITE);
});

it("erases to transparent", async () => {
  const { api, id } = await setup();
  api.setSession({ tool: "paint.eraser" });
  await stroke(
    api,
    [
      [40, 128],
      [200, 128],
    ],
    "paint.eraser",
  );
  expect(px(api, id, 128, 128)[3]).toBe(0);
  expect(px(api, id, 128, 60)).toEqual(WHITE);
});

it("paints on the mask and leaves the image alone", async () => {
  const { api, id } = await setup({ maskFile: "m.mask.png" });
  api.writeRegion(
    id,
    "mask",
    { x: 0, y: 0, width: 256, height: 256 },
    new Uint8Array(256 * 256).fill(255),
  );
  api.setSession({ target: "mask" });
  await stroke(api, [
    [40, 128],
    [200, 128],
  ]);
  expect(px(api, id, 128, 128, "mask")).toEqual([0]);
  expect(px(api, id, 128, 60, "mask")).toEqual([255]);
  expect(px(api, id, 128, 128)).toEqual(WHITE);
});

it("asks before painting on a text layer", async () => {
  const { api, id } = await setup({ text: { content: "hi" } as never });
  await stroke(api, [
    [40, 128],
    [200, 128],
  ]);
  fireEvent.click(await page.getByRole("button", { name: "Cancel" }).element());
  await tick();
  expect(api.doc().manifest.layers[0]!.text).toBeDefined();
  expect(px(api, id, 128, 128)).toEqual(WHITE);

  await stroke(api, [
    [40, 128],
    [200, 128],
  ]);
  fireEvent.click(await page.getByRole("button", { name: "Rasterize" }).element());
  await tick();
  expect(api.doc().manifest.layers[0]!.text).toBeUndefined();
  expect(px(api, id, 128, 128)).toEqual(BLACK);
});

it("paints only inside the selection", async () => {
  const { api, id } = await setup();
  writeSelection(
    api,
    new Uint8Array(128 * 256).fill(255),
    { x: 0, y: 0, width: 128, height: 256 },
    "replace",
  );
  await stroke(api, [
    [40, 128],
    [200, 128],
  ]);
  expect(px(api, id, 100, 128)).toEqual(BLACK);
  expect(px(api, id, 160, 128)).toEqual(WHITE);
});

const SMALL = box([50, 50], [100, 100]);

it("grows the layer to the canvas when the stroke leaves it, in the same undo step", async () => {
  const { api, id, store } = await setup({ transform: SMALL }, RED);
  const pos = store.position();
  await stroke(api, [
    [100, 100],
    [10, 10],
  ]);
  expect(api.pixelSize(id, "image")).toEqual({ width: 256, height: 256 });
  expect(api.doc().manifest.layers[0]!.transform).toEqual(box([0, 0], [256, 256]));
  expect(docPx(api, 140, 140)).toEqual(RED);
  expect(docPx(api, 60, 140)).toEqual(RED);
  expect(docPx(api, 12, 12)).toEqual(BLACK);
  expect(store.position()).toBe(pos + 1);
  key("z", mod);
  expect(api.pixelSize(id, "image")).toEqual({ width: 100, height: 100 });
  expect(api.doc().manifest.layers[0]!.transform).toEqual(SMALL);
  expect(px(api, id, 50, 50)).toEqual(RED);
});

it("keeps the mask in place when the image grows", async () => {
  const { api, id } = await setup({ transform: SMALL, maskFile: "m.mask.png" }, RED);
  const mask = new Uint8Array(100 * 100).map((_, i) => (i % 100 < 50 ? 0 : 255));
  api.writeRegion(id, "mask", { x: 0, y: 0, width: 100, height: 100 }, mask);
  await stroke(api, [
    [100, 100],
    [10, 10],
  ]);
  expect(api.doc().manifest.layers[0]!.maskPlacement).toEqual(SMALL);
  expect(api.readRegion(id, "mask", { x: 0, y: 0, width: 100, height: 100 })).toEqual(mask);
});

it("paints inside the old bounds when the budget says no", async () => {
  const { api, id } = await setup({ transform: SMALL }, RED);
  vi.spyOn(api, "checkBudget").mockReturnValue(new ViewerError("too_large"));
  const shown = vi.spyOn(api, "showError");
  await stroke(api, [
    [100, 100],
    [10, 10],
  ]);
  expect(shown).toHaveBeenCalledWith(expect.objectContaining({ code: "too_large" }));
  expect(api.pixelSize(id, "image")).toEqual({ width: 100, height: 100 });
  expect(px(api, id, 5, 5)).toEqual(BLACK);
  expect(docPx(api, 12, 12)[3]).toBe(0);
});

it("grows the mask, not the image, when painting the mask past its edge", async () => {
  const { api, id } = await setup({ maskFile: "m.mask.png", maskPlacement: SMALL });
  // writeRegion would make a missing mask at the transform's size; this one is 100 × 100.
  api.resizePixels(
    id,
    "mask",
    { width: 100, height: 100 },
    {
      pixels: new Uint8Array(100 * 100).fill(255),
    },
  );
  api.setSession({ target: "mask" });
  await stroke(api, [
    [100, 100],
    [10, 10],
  ]);
  expect(api.pixelSize(id, "mask")).toEqual({ width: 256, height: 256 });
  expect(api.pixelSize(id, "image")).toEqual({ width: 256, height: 256 });
  expect(api.doc().manifest.layers[0]!.maskPlacement).toEqual(box([0, 0], [256, 256]));
  expect(px(api, id, 12, 12, "mask")).toEqual([0]);
});

it("changes size, hardness and colors from the keyboard", async () => {
  const { api } = await setup();
  setToolState(api, { brush: { ...toolState(api).brush, size: 30, hardness: 0.5 } });
  key("]", { code: "BracketRight" });
  expect(toolState(api).brush.size).toBe(33);
  key("}", { code: "BracketRight", shiftKey: true });
  expect(toolState(api).brush.hardness).toBe(0.75);
  key("x", { code: "KeyX" });
  expect(toolState(api).fg).toEqual(WHITE);
  expect(toolState(api).bg).toEqual(BLACK);
});

it("logs frame times on a large layer (not a gate)", async () => {
  // Kept small: CI may run software GL.
  const { api } = await setup({}, WHITE, 2048);
  setToolState(api, { brush: { ...toolState(api).brush, size: 60, hardness: 0.5 } });
  const t = tools().find((x) => x.id === "paint.brush")!;
  t.onPointerDown?.({ x: 100, y: 100 }, new PointerEvent("pointerdown"), api);
  await tick();
  const times: number[] = [];
  const end = performance.now() + 1000;
  for (let i = 0; performance.now() < end; i++) {
    const start = performance.now();
    t.onPointerMove?.(
      { x: 100 + ((i * 7) % 1800), y: 100 + i * 3 },
      new PointerEvent("pointermove"),
      api,
    );
    times.push(performance.now() - start);
  }
  t.onPointerUp?.({ x: 100, y: 100 }, new PointerEvent("pointerup"), api);
  times.sort((a, b) => a - b);
  console.info(
    `brush frame ms: n=${times.length} median=${times[times.length >> 1]!.toFixed(1)} max=${times.at(-1)!.toFixed(1)}`,
  );
  expect(times.length).toBeGreaterThan(0);
});
