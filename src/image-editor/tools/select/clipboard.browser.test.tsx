import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewerError } from "../../../contract/errors";
import type { EditorApi } from "../../api";
import { resetRegistry, tools } from "../../registry";
import { makeDoc } from "../../test/make-doc";
import { mountCanvas } from "../../test/mount-canvas";
import { registerSelectPaint } from "../register";
import { clearSelection, copy, cut, internalClip, pasteInternal } from "./clipboard";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  vi.restoreAllMocks();
});

const RED: [number, number, number, number] = [255, 0, 0, 255];

async function setup(opts: { select: boolean; mask?: boolean } = { select: true }) {
  const made = makeDoc({
    width: 64,
    height: 64,
    layers: [opts.mask ? { maskFile: "m.png" } : {}, {}],
  });
  const [bottom, top] = made.manifest.layers;
  const pixels = new Map(made.pixels);
  if (opts.mask) pixels.set(bottom.id, { image: { kind: "gpu" }, mask: { kind: "gpu" } });
  const doc = { ...made, pixels };
  const m = await mountCanvas(doc, { [bottom.id]: RED, [top.id]: [0, 0, 255, 255] });
  mounted.push(m.unmount);
  const id = opts.mask ? bottom.id : top.id;
  m.api.setSession({ active: id, target: opts.mask ? "mask" : "image" });
  if (opts.mask)
    m.api.writeRegion(
      id,
      "mask",
      { x: 0, y: 0, width: 64, height: 64 },
      new Uint8Array(4096).fill(255),
    );
  if (opts.select) {
    const rect = tools().find((t) => t.id === "select.rect");
    rect?.onPointerDown?.({ x: 28, y: 28 }, new PointerEvent("pointerdown"), m.api);
    rect?.onPointerUp?.({ x: 36, y: 36 }, new PointerEvent("pointerup"), m.api);
  }
  return { ...m, id };
}
const px = (
  api: EditorApi,
  id: string,
  x: number,
  y: number,
  target: "image" | "mask" = "image",
) => [...api.readRegion(id, target, { x, y, width: 1, height: 1 })];

it("copies the selection and pastes it as a new layer at the same place", async () => {
  const { api, store } = await setup();
  expect(copy(api, false)).toBe(true);
  const clip = internalClip(api);
  expect([clip?.width, clip?.height, clip?.origin]).toEqual([8, 8, { x: 28, y: 28 }]);
  const pos = store.position();
  const layers = api.doc().manifest.layers.length;
  pasteInternal(api);
  expect(api.doc().manifest.layers.length).toBe(layers + 1);
  expect(store.position()).toBe(pos + 1);
  const pasted = api.doc().manifest.layers.find((l) => l.id === api.session().active);
  expect(pasted?.transform.origin).toEqual([28, 28]);
  expect(pasted?.name).toBe("Pasted Layer");
  expect(px(api, pasted?.id as string, 3, 3)).toEqual([0, 0, 255, 255]);
});

it("copies the whole layer without a selection", async () => {
  const { api } = await setup({ select: false });
  copy(api, false);
  expect([internalClip(api)?.width, internalClip(api)?.height]).toEqual([64, 64]);
});

it("clears the image inside the selection, outside unchanged, one undo step", async () => {
  const { api, id, store } = await setup();
  const pos = store.position();
  expect(clearSelection(api)).toBe(true);
  expect(px(api, id, 30, 30)[3]).toBe(0);
  expect(px(api, id, 10, 10)).toEqual([0, 0, 255, 255]);
  expect(store.position()).toBe(pos + 1);
});

it("blacks out the mask inside the selection", async () => {
  const { api, id } = await setup({ select: true, mask: true });
  clearSelection(api);
  expect(px(api, id, 30, 30, "mask")[0]).toBe(0);
  expect(px(api, id, 10, 10, "mask")[0]).toBe(255);
});

it("does nothing without a selection", async () => {
  const { api } = await setup({ select: false });
  expect(clearSelection(api)).toBe(false);
});

it("cut copies then clears", async () => {
  const { api, id } = await setup();
  cut(api);
  expect(internalClip(api)?.width).toBe(8);
  expect(px(api, id, 30, 30)[3]).toBe(0);
});

it("hands a ClipboardItem to the system clipboard during the copy call", async () => {
  const { api } = await setup();
  const write = vi.fn<() => Promise<void>>(() => Promise.resolve());
  vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ write } as never);
  copy(api, false);
  expect(write).toHaveBeenCalledTimes(1);
  expect((write.mock.calls[0] as unknown[])[0]).toEqual([expect.any(ClipboardItem)]);
});

it("reports a budget error and creates no layer", async () => {
  const { api } = await setup();
  copy(api, false);
  const err = new ViewerError("too_large");
  vi.spyOn(api, "checkBudget").mockReturnValue(err);
  const showError = vi.spyOn(api, "showError");
  const layers = api.doc().manifest.layers.length;
  pasteInternal(api);
  expect(api.doc().manifest.layers.length).toBe(layers);
  expect(showError).toHaveBeenCalledWith(err);
});

async function pasteEvent(root: HTMLElement): Promise<void> {
  const c = new OffscreenCanvas(4, 4);
  c.getContext("2d")?.fillRect(0, 0, 4, 4);
  const blob = await c.convertToBlob({ type: "image/png" });
  const dt = new DataTransfer();
  dt.items.add(new File([blob], "p.png", { type: "image/png" }));
  root.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
}

it("pastes an image file from a paste event, and stops after unmount", async () => {
  const { api } = await setup({ select: false });
  const root = document.querySelector<HTMLElement>(".fv-root") ?? document.body;
  const layers = api.doc().manifest.layers.length;
  await pasteEvent(root);
  expect(api.doc().manifest.layers.length).toBe(layers + 1);
  expect(api.doc().manifest.layers.find((l) => l.id === api.session().active)?.name).toBe(
    "Pasted Layer",
  );
  mounted.pop()?.();
  await pasteEvent(root);
  expect(api.doc().manifest.layers.length).toBe(layers + 1);
});
