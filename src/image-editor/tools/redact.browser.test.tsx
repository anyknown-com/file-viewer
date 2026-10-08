import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defaultAdjustment } from "../adjust/settings";
import type { EditorApi, LayerId } from "../api";
import { resetRegistry, tools } from "../registry";
import { isMac } from "../shortcut";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";
import { blackRef, mosaicRef, redactSelection } from "./redact";
import { registerSelectPaint } from "./register";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const SIZE = 32;
const WHOLE = { x: 0, y: 0, width: SIZE, height: SIZE };
const SEL = { x: 8, y: 8, width: 16, height: 16 };
const mod = isMac() ? { metaKey: true } : { ctrlKey: true };

/** A distinct color per pixel, shifted by `seed` so each layer differs. */
function ramp(seed: number): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++)
    out.set([(i * 7 + seed) % 256, (i * 13) % 256, (i * 29 + seed * 3) % 256, 255], i * 4);
  return out;
}

/** `full` with the SEL box replaced by `box`. */
function withBox(full: Uint8Array, box: Uint8Array): Uint8Array {
  const out = full.slice();
  for (let y = 0; y < SEL.height; y++)
    out.set(
      box.subarray(y * SEL.width * 4, (y + 1) * SEL.width * 4),
      ((SEL.y + y) * SIZE + SEL.x) * 4,
    );
  return out;
}

function boxOf(full: Uint8Array): Uint8Array {
  const out = new Uint8Array(SEL.width * SEL.height * 4);
  for (let y = 0; y < SEL.height; y++)
    out.set(
      full.subarray(((SEL.y + y) * SIZE + SEL.x) * 4, ((SEL.y + y) * SIZE + SEL.x + SEL.width) * 4),
      y * SEL.width * 4,
    );
  return out;
}

/** Normal, hidden, text, masked and adjustment layers; each pixel layer a distinct ramp; SEL selected. */
async function setup() {
  const adjustment = defaultAdjustment("Invert", 7);
  const doc = makeDoc({
    width: SIZE,
    height: SIZE,
    layers: [
      {},
      { isVisible: false },
      { text: { content: "hi" } as never },
      { maskFile: "m.mask.png" },
      { adjustment },
    ],
  });
  const m = await mountEditor(doc, undefined, { width: 400, height: 300 });
  mounted.push(m.unmount);
  const ids = doc.manifest.layers.map((l) => l.id);
  const pixelIds = ids.slice(0, 4);
  pixelIds.forEach((id, i) => m.api.writeRegion(id, "image", WHOLE, ramp(i * 40)));
  m.api.writeRegion(ids[3]!, "mask", WHOLE, new Uint8Array(SIZE * SIZE).fill(200));
  const rect = tools().find((t) => t.id === "select.rect");
  rect?.onPointerDown?.({ x: SEL.x, y: SEL.y }, new PointerEvent("pointerdown"), m.api);
  rect?.onPointerUp?.(
    { x: SEL.x + SEL.width, y: SEL.y + SEL.height },
    new PointerEvent("pointerup"),
    m.api,
  );
  return { ...m, ids, pixelIds, adjustment };
}

const read = (api: EditorApi, id: LayerId) => api.readRegion(id, "image", WHOLE);
const layer = (api: EditorApi, id: LayerId) => api.doc().manifest.layers.find((l) => l.id === id);
const ALL = new Uint8Array(SEL.width * SEL.height).fill(255);

it("mosaics the selection on every pixel layer in one undo step", async () => {
  const { api, store, ids, pixelIds, adjustment } = await setup();
  const before = pixelIds.map((id) => read(api, id));
  const mask = api.readRegion(ids[3]!, "mask", WHOLE);
  const pos = store.position();

  redactSelection(api, { style: "mosaic", cell: 8 });

  pixelIds.forEach((id, i) => {
    const box = mosaicRef(boxOf(before[i]!), SEL.width, SEL.height, 8, ALL);
    expect(read(api, id)).toEqual(withBox(before[i]!, box));
  });
  expect(layer(api, ids[2]!)?.text).toBeUndefined();
  expect(api.readRegion(ids[3]!, "mask", WHOLE)).toEqual(mask);
  expect(layer(api, ids[4]!)?.adjustment).toStrictEqual(adjustment);
  expect(store.position()).toBe(pos + 1);

  fireEvent.keyDown(document.body, { key: "z", ...mod });
  pixelIds.forEach((id, i) => expect(read(api, id)).toEqual(before[i]));
  expect(layer(api, ids[2]!)?.text).toEqual({ content: "hi" });
  expect(store.position()).toBe(pos);
});

it("turns the selection black on every pixel layer", async () => {
  const { api, pixelIds } = await setup();
  const before = pixelIds.map((id) => read(api, id));
  redactSelection(api, { style: "black", cell: 8 });
  pixelIds.forEach((id, i) => {
    const box = boxOf(read(api, id));
    expect(box).toEqual(blackRef(boxOf(before[i]!), ALL));
    expect(box.subarray(0, 4)).toEqual(new Uint8Array([0, 0, 0, 255]));
    expect(read(api, id)).toEqual(withBox(before[i]!, box));
  });
});
