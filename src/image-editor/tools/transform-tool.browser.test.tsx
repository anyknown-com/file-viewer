import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import userEvents from "@testing-library/user-event";
import { page } from "vitest/browser";
import type { Doc, EditorApi, Layer, LayerDecor, Point, Selection, ToolSpec } from "../api";
import { viewportOf } from "../canvas";
import type { DocStore } from "../doc/store";
import {
  menuItems,
  registerLayerDecor,
  registerSelection,
  resetRegistry,
  tools,
} from "../registry";
import { isMac } from "../shortcut";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";

const uid = () => crypto.randomUUID().toUpperCase();
const ids = { bg: uid(), box: uid() };
type Transform = Layer["transform"];
const transform = (o: [number, number], s: [number, number]): Transform => ({
  origin: o,
  size: s,
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "Nearest",
});

// A 400 × 300 canvas; the box layer (active) is 100 × 50 at (20, 20).
function doc(): Doc {
  return makeDoc({
    width: 400,
    height: 300,
    layers: [
      { id: ids.bg, name: "Background", transform: transform([0, 0], [400, 300]) },
      { id: ids.box, name: "Box", transform: transform([20, 20], [100, 50]) },
    ],
  });
}

let m: { api: EditorApi; store: DocStore; unmount(): void };
beforeAll(async () => {
  await page.viewport(1400, 900);
});
beforeEach(() => resetRegistry());
afterEach(() => {
  m?.unmount();
  resetRegistry();
});

async function mount(d: Doc = doc()) {
  m = await mountEditor(d);
  m.api.setSession({ tool: "move", active: ids.box });
}
const move = (): ToolSpec => {
  const t = tools().find((x) => x.id === "move");
  if (!t) throw new Error("no move tool");
  return t;
};
const box = () => m.store.get().manifest.layers.find((l) => l.id === ids.box)?.transform;
type Mods = { shiftKey?: boolean; altKey?: boolean };
function drag(from: Point, to: Point, mods: Mods = {}) {
  const t = move();
  t.onPointerDown?.(from, new PointerEvent("pointerdown", mods), m.api);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  t.onPointerMove?.(mid, new PointerEvent("pointermove", mods), m.api);
  t.onPointerMove?.(to, new PointerEvent("pointermove", mods), m.api);
  t.onPointerUp?.(to, new PointerEvent("pointerup", mods), m.api);
}
const key = (k: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));

describe("transform tool", () => {
  it("moves by dragging inside the box, one undo step", async () => {
    await mount();
    const start = m.store.get();
    drag({ x: 50, y: 40 }, { x: 83, y: 81 });
    expect(box()?.origin).toEqual([53, 61]);
    expect(m.store.canUndo()).toBe(true);
    key("z", { metaKey: isMac(), ctrlKey: !isMac() });
    expect(m.store.get()).toBe(start);
    expect(m.store.canUndo()).toBe(false);
  });

  it("snaps the box center to the canvas center", async () => {
    await mount();
    // Center (70, 45) moved by (126, 98) lands at (196, 143): 4 and 7 px from (200, 150).
    drag({ x: 50, y: 40 }, { x: 176, y: 138 });
    expect(box()?.origin).toEqual([150, 125]);
  });

  it("keeps proportions with Shift on a corner", async () => {
    await mount();
    drag({ x: 120, y: 70 }, { x: 220, y: 90 }, { shiftKey: true });
    const t = box();
    expect(t?.origin).toEqual([20, 20]);
    expect((t?.size[0] ?? 0) / (t?.size[1] ?? 1)).toBeCloseTo(2, 6);
    expect(t?.size[0]).toBeGreaterThan(100);
  });

  it("scales about the center with Alt", async () => {
    await mount();
    drag({ x: 120, y: 45 }, { x: 140, y: 45 }, { altKey: true });
    const t = box();
    expect(t?.size).toEqual([140, 50]);
    expect((t?.origin[0] ?? 0) + 70).toBeCloseTo(70, 6);
  });

  it("rotates with the rotate handle", async () => {
    await mount();
    // The handle sits 24 px above the top edge's middle; the center is (70, 45).
    drag({ x: 70, y: -4 }, { x: 170, y: 45 });
    expect(box()?.rotation).toBeCloseTo(90, 6);
  });

  it("sets the width from the panel", async () => {
    await mount();
    const user = userEvents.setup({ pointerEventsCheck: 0 });
    const input = await vi.waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[aria-label="W"]');
      if (!el) throw new Error("no width field");
      return el;
    });
    await user.tripleClick(input);
    await user.keyboard("200{Enter}");
    await vi.waitFor(() => expect(box()?.size[0]).toBe(200));
    expect(box()?.size[1]).toBe(50);
  });

  it("nudges with the arrow keys", async () => {
    await mount();
    key("ArrowRight");
    expect(box()?.origin).toEqual([21, 20]);
    key("ArrowDown", { shiftKey: true });
    expect(box()?.origin).toEqual([21, 30]);
    key("z", { metaKey: isMac(), ctrlKey: !isMac() });
    expect(box()?.origin).toEqual([21, 20]);
  });

  it("calls onTransformEnd once per release", async () => {
    const spy = vi.fn<NonNullable<LayerDecor["onTransformEnd"]>>();
    registerLayerDecor({ id: "spy", onTransformEnd: spy });
    await mount();
    drag({ x: 50, y: 40 }, { x: 83, y: 81 });
    drag({ x: 80, y: 80 }, { x: 70, y: 70 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toBe(ids.box);
    expect(spy.mock.calls[0][1].origin).toEqual([20, 20]);
  });

  it("hands drags to the selection's move hooks while there is a selection", async () => {
    let selected = true;
    const hooks = {
      onPointerDown: vi.fn<() => void>(),
      onPointerMove: vi.fn<() => void>(),
      onPointerUp: vi.fn<() => void>(),
      onDeactivate: vi.fn<() => void>(),
    };
    registerSelection({ get: () => (selected ? ({} as Selection) : null), move: hooks });
    await mount();
    drag({ x: 50, y: 40 }, { x: 83, y: 81 });
    expect(hooks.onPointerDown).toHaveBeenCalledTimes(1);
    expect(hooks.onPointerMove).toHaveBeenCalledTimes(2);
    expect(hooks.onPointerUp).toHaveBeenCalledTimes(1);
    expect(box()?.origin).toEqual([20, 20]);
    selected = false;
    drag({ x: 50, y: 40 }, { x: 83, y: 81 });
    expect(box()?.origin).toEqual([53, 61]);
    expect(hooks.onPointerDown).toHaveBeenCalledTimes(1);
    m.api.setSession({ tool: "hand" });
    expect(hooks.onDeactivate).toHaveBeenCalledTimes(1);
  });
});

describe("view and canvas", () => {
  it("fits the whole canvas in the window on Mod+0", async () => {
    await mount();
    const vp = viewportOf(m.api);
    if (!vp) throw new Error("no viewport");
    await vi.waitFor(() => expect(vp.size().width).toBeGreaterThan(0));
    vp.setView({ zoom: 8, center: { x: 0, y: 0 } });
    key("0", { metaKey: isMac(), ctrlKey: !isMac() });
    const { zoom, center } = vp.view();
    const size = vp.size();
    const left = size.width / 2 - center.x * zoom;
    const top = size.height / 2 - center.y * zoom;
    expect(left).toBeGreaterThanOrEqual(-1e-6);
    expect(top).toBeGreaterThanOrEqual(-1e-6);
    expect(left + 400 * zoom).toBeLessThanOrEqual(size.width + 1e-6);
    expect(top + 300 * zoom).toBeLessThanOrEqual(size.height + 1e-6);
  });

  it("turns the canvas 90° clockwise", async () => {
    const small = makeDoc({
      width: 40,
      height: 30,
      layers: [
        { id: ids.bg, transform: transform([0, 0], [40, 30]) },
        { id: ids.box, transform: transform([0, 0], [10, 20]) },
      ],
    });
    m = await mountEditor(small, { [ids.bg]: [255, 0, 0, 255], [ids.box]: [0, 0, 255, 255] });
    const before = m.api.readComposite({ x: 0, y: 0, width: 40, height: 30 });
    menuItems("image")
      .find((i) => i.id === "image.rotateCw")
      ?.run(m.api);
    const { width, height } = m.store.get().manifest;
    expect([width, height]).toEqual([30, 40]);
    const after = m.api.readComposite({ x: 0, y: 0, width: 30, height: 40 });
    let worst = 0;
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        // (x, y) lands on (29 - y, x).
        const a = (y * 40 + x) * 4;
        const b = (x * 30 + (29 - y)) * 4;
        for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(before[a + c] - after[b + c]));
      }
    }
    expect(worst).toBeLessThanOrEqual(2);
  });
});
