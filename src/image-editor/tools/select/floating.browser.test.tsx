import { afterEach, beforeEach, expect, it } from "vitest";
import type { EditorApi } from "../../api";
import { resetRegistry, tools } from "../../registry";
import { makeDoc } from "../../test/make-doc";
import { mountCanvas } from "../../test/mount-canvas";
import { registerSelectPaint } from "../register";
import { undo } from "../../layer-ops";
import { isMac } from "../../shortcut";
import {
  beginFloat,
  cancelFloat,
  commitFloat,
  floating,
  moveFloat,
  selectionMove,
} from "./floating";
import { readSelection } from "./mask";

// The move tool belongs to 10 (not registered yet), so `selectionMove` is driven directly.
const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const RED = [255, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

async function setup() {
  const doc = makeDoc({ width: 64, height: 64, layers: [{}] });
  const m = await mountCanvas(doc, { [doc.manifest.layers[0].id]: [255, 255, 255, 255] });
  mounted.push(m.unmount);
  const id = doc.manifest.layers[0].id;
  m.api.writeRegion(
    id,
    "image",
    { x: 28, y: 28, width: 8, height: 8 },
    new Uint8Array(64 * 4).map((_, i) => RED[i % 4]),
  );
  const rect = tools().find((t) => t.id === "select.rect");
  rect?.onPointerDown?.({ x: 28, y: 28 }, ev("pointerdown"), m.api);
  rect?.onPointerUp?.({ x: 36, y: 36 }, ev("pointerup"), m.api);
  return { ...m, id, ev };
}
const px = (api: EditorApi, id: string, x: number, y: number) => [
  ...api.readRegion(id, "image", { x, y, width: 1, height: 1 }),
];
const ev = (type: string, init = {}) => new PointerEvent(type, init);
const at = (api: EditorApi, x: number, y: number) => readSelection(api)[y * 64 + x];

it("lifts, moves and commits as one undo step", async () => {
  const { api, store, id } = await setup();
  const pos = store.position();
  expect(beginFloat(api, { duplicate: false })).toBe(true);
  expect(px(api, id, 30, 30)[3]).toBe(0);
  moveFloat(api, 10, 0);
  commitFloat(api);
  expect(px(api, id, 40, 30)).toEqual(RED);
  expect(px(api, id, 30, 30)[3]).toBe(0);
  expect(store.position()).toBe(pos + 1);
  expect(at(api, 40, 30)).toBe(255);
  expect(at(api, 30, 30)).toBe(0);
  undo(api);
  expect(px(api, id, 30, 30)).toEqual(RED);
  expect(px(api, id, 40, 30)).toEqual(WHITE);
});

it("keeps the source when duplicating and restores on cancel", async () => {
  const { api, id } = await setup();
  beginFloat(api, { duplicate: true });
  moveFloat(api, 10, 0);
  commitFloat(api);
  expect(px(api, id, 30, 30)).toEqual(RED);
  expect(px(api, id, 40, 30)).toEqual(RED);
  const before = [...api.readRegion(id, "image", { x: 0, y: 0, width: 64, height: 64 })];
  beginFloat(api, { duplicate: false });
  cancelFloat(api);
  expect([...api.readRegion(id, "image", { x: 0, y: 0, width: 64, height: 64 })]).toEqual(before);
});

it("drags with the move provider, nudges with arrows and merges on deactivate", async () => {
  const { api, store, id, ev } = await setup();
  const pos = store.position();
  selectionMove.onPointerDown?.({ x: 30, y: 30 }, ev("pointerdown"), api);
  selectionMove.onPointerMove?.({ x: 40, y: 30 }, ev("pointermove"), api);
  selectionMove.onPointerUp?.({ x: 40, y: 30 }, ev("pointerup"), api);
  expect(floating(api)).not.toBeNull();
  expect(api.doc().manifest.layers[0].transform.origin).toEqual([0, 0]);
  selectionMove.onKeyDown?.(new KeyboardEvent("keydown", { key: "ArrowRight" }), api);
  selectionMove.onDeactivate?.(api);
  expect(floating(api)).toBeNull();
  expect(px(api, id, 41, 30)).toEqual(RED);
  expect(px(api, id, 30, 30)[3]).toBe(0);
  expect(store.position()).toBe(pos + 1);
});

it("moves with Mod + drag in a selection tool and Alt copies", async () => {
  const { api, id, ev } = await setup();
  const mod = isMac() ? { metaKey: true } : { ctrlKey: true };
  const rect = tools().find((t) => t.id === "select.rect");
  rect?.onPointerDown?.({ x: 30, y: 30 }, ev("pointerdown", { ...mod, altKey: true }), api);
  rect?.onPointerMove?.({ x: 40, y: 30 }, ev("pointermove", { ...mod, altKey: true }), api);
  rect?.onPointerUp?.({ x: 40, y: 30 }, ev("pointerup", mod), api);
  rect?.onKeyDown?.(new KeyboardEvent("keydown", { key: "Enter" }), api);
  expect(px(api, id, 30, 30)).toEqual(RED);
  expect(px(api, id, 40, 30)).toEqual(RED);
});

it("does nothing without a selection", async () => {
  const doc = makeDoc({ width: 64, height: 64, layers: [{}] });
  const m = await mountCanvas(doc);
  mounted.push(m.unmount);
  expect(beginFloat(m.api, { duplicate: false })).toBe(false);
});
