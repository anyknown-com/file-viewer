import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { undo } from "../../layer-ops";
import { resetRegistry, tools } from "../../registry";
import { makeDoc } from "../../test/make-doc";
import { mountCanvas } from "../../test/mount-canvas";
import { registerSelectPaint } from "../register";
import { setToolState, toolState } from "../state";
import { applyFill, openFillDialog } from "./fill-dialog";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

it("fills the selection with half-opaque red over white, undoable in one step", async () => {
  const doc = makeDoc({ width: 64, height: 64, layers: [{}] });
  const id = doc.manifest.layers[0].id;
  const m = await mountCanvas(doc, { [id]: [255, 255, 255, 255] });
  mounted.push(m.unmount);
  setToolState(m.api, { fg: [255, 0, 0, 255] });
  const rect = tools().find((t) => t.id === "select.rect");
  rect?.onPointerDown?.({ x: 28, y: 28 }, new PointerEvent("pointerdown"), m.api);
  rect?.onPointerUp?.({ x: 36, y: 36 }, new PointerEvent("pointerup"), m.api);
  const pos = m.store.position();
  expect(applyFill(m.api, { contents: "foreground", opacity: 50 })).toBe(true);
  const at = (x: number, y: number) => [
    ...m.api.readRegion(id, "image", { x, y, width: 1, height: 1 }),
  ];
  expect(at(30, 30)).toEqual([255, 128, 128, 255]);
  expect(at(10, 10)).toEqual([255, 255, 255, 255]);
  expect(m.store.position()).toBe(pos + 1);
  undo(m.api);
  expect(at(30, 30)).toEqual([255, 255, 255, 255]);
});

const WHOLE = { x: 0, y: 0, width: 32, height: 32 };

/** A 32 × 32 white layer with a red 6 × 6 block at (13, 13), and (12, 12)–(20, 20) selected. */
async function redBlock() {
  const doc = makeDoc({ width: 32, height: 32, layers: [{}] });
  const id = doc.manifest.layers[0].id;
  const m = await mountCanvas(doc, { [id]: [255, 255, 255, 255] });
  mounted.push(m.unmount);
  const red = new Uint8Array(36 * 4);
  for (let i = 0; i < red.length; i += 4) red.set([255, 0, 0, 255], i);
  m.api.writeRegion(id, "image", { x: 13, y: 13, width: 6, height: 6 }, red);
  const rect = tools().find((t) => t.id === "select.rect");
  rect?.onPointerDown?.({ x: 12, y: 12 }, new PointerEvent("pointerdown"), m.api);
  rect?.onPointerUp?.({ x: 20, y: 20 }, new PointerEvent("pointerup"), m.api);
  return { ...m, id };
}

async function click(name: string): Promise<void> {
  const button = page.getByRole("button", { name });
  await expect.element(button).toBeInTheDocument();
  fireEvent.click(button.element());
}

async function confirmContentAware(api: Parameters<typeof openFillDialog>[0]): Promise<void> {
  openFillDialog(api);
  await click("Content-Aware");
  await click("OK");
}

it("fills the selection content-aware in the worker, undoable in one step", async () => {
  const { api, id, store } = await redBlock();
  const before = api.readRegion(id, "image", WHOLE);
  const pos = store.position();
  await confirmContentAware(api);
  await expect.poll(() => store.position(), { timeout: 10_000 }).toBe(pos + 1);
  const expected = before.slice();
  for (let y = 12; y < 20; y++) expected.fill(255, (y * 32 + 12) * 4, (y * 32 + 20) * 4);
  expect(api.readRegion(id, "image", WHOLE)).toEqual(expected);
  undo(api);
  expect(api.readRegion(id, "image", WHOLE)).toEqual(before);
});

it("changes nothing when Stop is pressed before the job comes back", async () => {
  const { api, id, store } = await redBlock();
  const before = api.readRegion(id, "image", WHOLE);
  const pos = store.position();
  vi.spyOn(api, "runInWorker").mockImplementation(
    (_job, _transfer, signal) =>
      new Promise((_, reject) =>
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      ),
  );
  await confirmContentAware(api);
  await click("Stop");
  await expect.poll(() => toolState(api).job).toBeNull();
  expect(api.readRegion(id, "image", WHOLE)).toEqual(before);
  expect(store.position()).toBe(pos);
});
