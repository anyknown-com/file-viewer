import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { EditorApi, Layer, Point, ToolSpec } from "../api";
import type { DocStore } from "../doc/store";
import { resetRegistry, tools } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";
import { CROP_RATIOS, cropState, setCropRatio } from "./crop-panel";

const box = (x: number, y: number, w: number, h: number): Layer["transform"] => ({
  origin: [x, y],
  size: [w, h],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "Nearest",
});

// A 120 × 90 canvas: a full background and a 20 × 10 layer at (50, 40).
const doc = () =>
  makeDoc({
    width: 120,
    height: 90,
    layers: [
      { id: "BG", transform: box(0, 0, 120, 90) },
      { id: "S", transform: box(50, 40, 20, 10) },
    ],
  });

let m: { api: EditorApi; store: DocStore; unmount(): void };
beforeAll(async () => {
  await page.viewport(1400, 900);
});
beforeEach(async () => {
  resetRegistry();
  m = await mountEditor(doc());
  m.api.setSession({ tool: "crop" });
});
afterEach(() => {
  m.unmount();
  resetRegistry();
});

const crop = (): ToolSpec => {
  const t = tools().find((x) => x.id === "crop");
  if (!t) throw new Error("no crop tool");
  return t;
};
function drag(from: Point, to: Point, altKey = false) {
  const t = crop();
  t.onPointerDown?.(from, new PointerEvent("pointerdown", { altKey }), m.api);
  t.onPointerMove?.(to, new PointerEvent("pointermove", { altKey }), m.api);
  t.onPointerUp?.(to, new PointerEvent("pointerup", { altKey }), m.api);
}
const key = (k: string) =>
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

describe("crop tool", () => {
  it.each(CROP_RATIOS)("drags out a box in the %s ratio", (ratio) => {
    setCropRatio(m.api, ratio);
    drag({ x: 10, y: 10 }, { x: 70, y: 30 });
    const b = cropState(m.api).box;
    if (!b) throw new Error("no box");
    const want =
      ratio === "free"
        ? 60 / 20
        : ratio === "original"
          ? 120 / 90
          : Number(ratio.split(":")[0]) / Number(ratio.split(":")[1]);
    expect(b.width / b.height).toBeCloseTo(want, 6);
    expect(b.x).toBe(10);
    expect(b.y).toBe(10);
  });

  it("drags from the center with Alt", () => {
    drag({ x: 60, y: 45 }, { x: 80, y: 55 }, true);
    expect(cropState(m.api).box).toEqual({ x: 40, y: 35, width: 40, height: 20 });
  });

  it("crops the canvas on Enter: layers shift, pixels stay", () => {
    const rect = { x: 0, y: 0, width: 20, height: 10 };
    const pixels = [...m.api.readRegion("S", "image", rect)];
    drag({ x: 30, y: 20 }, { x: 100.4, y: 79.6 });
    key("Enter");
    const after = m.store.get().manifest;
    expect([after.width, after.height]).toEqual([70, 60]);
    expect(after.layers.map((l) => l.transform.origin)).toEqual([
      [-30, -20],
      [20, 20],
    ]);
    expect(m.api.pixelSize("S", "image")).toEqual({ width: 20, height: 10 });
    expect([...m.api.readRegion("S", "image", rect)]).toEqual(pixels);
    expect(cropState(m.api).box).toBeNull();
    expect(m.store.canUndo()).toBe(true);
  });

  it("drops the box on Esc and leaves the document alone", () => {
    const before = m.store.get();
    drag({ x: 30, y: 20 }, { x: 100, y: 80 });
    key("Escape");
    expect(cropState(m.api).box).toBeNull();
    key("Enter");
    expect(m.store.get()).toBe(before);
  });
});
