import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditorApi } from "../../api";
import { layerDecors, menuItems, resetRegistry, selectionProvider, tools } from "../../registry";
import { makeDoc } from "../../test/make-doc";
import { mountCanvas } from "../../test/mount-canvas";
import { registerSelectPaint } from "../register";
import { readSelection } from "./mask";

// 10 step 4 (`mountEditor`) is not there yet, so these drive the tool and menu specs on a
// `mountCanvas` editor instead of dispatching DOM events through the toolbar and layer panel.
const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

async function setup() {
  const doc = makeDoc({ width: 200, height: 200, layers: [{}] });
  const m = await mountCanvas(doc);
  mounted.push(m.unmount);
  return m;
}

type Mods = { shiftKey?: boolean; altKey?: boolean };
const tool = (id: string) => {
  const t = tools().find((x) => x.id === id);
  if (!t) throw new Error(id);
  return t;
};
const ev = (type: string, mods: Mods = {}) => new PointerEvent(type, mods);

function drag(
  api: EditorApi,
  id: string,
  a: [number, number],
  b: [number, number],
  mods: Mods = {},
) {
  const t = tool(id);
  t.onPointerDown?.({ x: a[0], y: a[1] }, ev("pointerdown", mods), api);
  t.onPointerMove?.({ x: b[0], y: b[1] }, ev("pointermove", mods), api);
  t.onPointerUp?.({ x: b[0], y: b[1] }, ev("pointerup", mods), api);
}
const at = (api: EditorApi, x: number, y: number) => readSelection(api)[y * 200 + x];
const run = (api: EditorApi, id: string) =>
  menuItems("select")
    .find((i) => i.id === id)
    ?.run(api);

it("combines rectangles with Shift, Alt and Shift + Alt", async () => {
  const { api } = await setup();
  drag(api, "select.rect", [20, 20], [80, 80]);
  expect(at(api, 50, 50)).toBe(255);
  expect(at(api, 90, 50)).toBe(0);
  drag(api, "select.rect", [100, 20], [160, 80], { shiftKey: true });
  expect(at(api, 50, 50)).toBe(255);
  expect(at(api, 130, 50)).toBe(255);
  drag(api, "select.rect", [10, 10], [60, 60], { altKey: true });
  expect(at(api, 30, 30)).toBe(0);
  expect(at(api, 70, 70)).toBe(255);
  drag(api, "select.rect", [150, 50], [190, 90], { shiftKey: true, altKey: true });
  expect(at(api, 130, 50)).toBe(255);
  expect(at(api, 70, 70)).toBe(0);
});

it("moves the marquee when dragging inside the selection and deselects on a click", async () => {
  const { api } = await setup();
  drag(api, "select.rect", [20, 20], [60, 60]);
  drag(api, "select.rect", [40, 40], [90, 40]);
  expect(at(api, 30, 30)).toBe(0);
  expect(at(api, 80, 30)).toBe(255);
  drag(api, "select.rect", [150, 150], [150, 150]);
  expect(api.selection()).toBeNull();
});

it("selects an ellipse and a polygon", async () => {
  const { api } = await setup();
  drag(api, "select.ellipse", [20, 20], [100, 100]);
  expect(at(api, 60, 60)).toBe(255);
  expect(at(api, 22, 22)).toBe(0);
  const poly = tool("select.polygon");
  for (const p of [
    [20, 20],
    [120, 20],
    [20, 120],
  ]) {
    poly.onPointerDown?.({ x: p[0], y: p[1] }, ev("pointerdown"), api);
  }
  poly.onKeyDown?.(new KeyboardEvent("keydown", { key: "Enter" }), api);
  expect(at(api, 40, 40)).toBe(255);
  expect(at(api, 100, 100)).toBe(0);
});

it("drops a polygon on Escape and leaves the selection alone", async () => {
  const { api } = await setup();
  drag(api, "select.rect", [20, 20], [60, 60]);
  const poly = tool("select.polygon");
  poly.onPointerDown?.({ x: 100, y: 100 }, ev("pointerdown"), api);
  poly.onPointerDown?.({ x: 150, y: 100 }, ev("pointerdown"), api);
  poly.onKeyDown?.(new KeyboardEvent("keydown", { key: "Escape" }), api);
  expect(poly.onKeyDown?.(new KeyboardEvent("keydown", { key: "Enter" }), api)).toBe(false);
  expect(at(api, 40, 40)).toBe(255);
  expect(at(api, 120, 100)).toBe(0);
});

it("runs the select menu without touching undo", async () => {
  const { api, store } = await setup();
  const position = store.position();
  run(api, "select.all");
  expect(at(api, 0, 0)).toBe(255);
  expect(at(api, 199, 199)).toBe(255);
  run(api, "select.deselect");
  expect(api.selection()).toBeNull();
  run(api, "select.reselect");
  expect(at(api, 100, 100)).toBe(255);
  run(api, "select.deselect");
  drag(api, "select.rect", [20, 20], [60, 60]);
  run(api, "select.inverse");
  expect(at(api, 40, 40)).toBe(0);
  expect(at(api, 100, 100)).toBe(255);
  run(api, "select.inverse");
  expect(api.selection()?.bounds).toEqual({ x: 20, y: 20, width: 40, height: 40 });
  expect(selectionProvider()?.get(api)?.bounds).toEqual(api.selection()?.bounds);
  expect(store.position()).toBe(position);
  run(api, "select.deselect");
  expect(api.selection()).toBeNull();
});

it("opens the expand dialog in the editor root and closes it on Cancel", async () => {
  const { api } = await setup();
  drag(api, "select.rect", [20, 20], [60, 60]);
  run(api, "select.expand");
  await vi.waitFor(() => expect(document.querySelector(".fv-root .fv-dialog")).not.toBeNull());
  const cancel = [...document.querySelectorAll<HTMLButtonElement>(".fv-dialog button")].find(
    (b) => b.textContent === "Cancel",
  );
  cancel?.click();
  await vi.waitFor(() => expect(document.querySelector(".fv-dialog")).toBeNull());
  expect(api.selection()?.bounds).toEqual({ x: 20, y: 20, width: 40, height: 40 });
});

it("loads a layer's transparency with Mod-click on its thumbnail", async () => {
  const doc = makeDoc({
    width: 200,
    height: 200,
    layers: [
      {
        transform: {
          origin: [0, 0],
          size: [100, 200],
          rotation: 0,
          flipX: false,
          flipY: false,
          sampling: "High quality",
        },
      },
      {
        transform: {
          origin: [100, 0],
          size: [100, 200],
          rotation: 0,
          flipX: false,
          flipY: false,
          sampling: "High quality",
        },
      },
    ],
  });
  const [a, b] = doc.manifest.layers;
  const m = await mountCanvas(doc, { [a.id]: [10, 20, 30, 128], [b.id]: [10, 20, 30, 255] });
  mounted.push(m.unmount);
  const { api } = m;
  const decor = layerDecors().find((d) => d.id === "select.thumbnailLoad");
  const active = api.session().active;
  const none = { mod: false, shift: false, alt: false };
  expect(decor?.onThumbnailClick?.(a, "image", none, api)).toBe(false);
  expect(decor?.onThumbnailClick?.(a, "image", { ...none, mod: true }, api)).toBe(true);
  expect(Math.abs(at(api, 50, 100) - 128)).toBeLessThanOrEqual(1);
  expect(at(api, 150, 100)).toBe(0);
  decor?.onThumbnailClick?.(b, "image", { ...none, mod: true, shift: true }, api);
  expect(at(api, 150, 100)).toBe(255);
  expect(Math.abs(at(api, 50, 100) - 128)).toBeLessThanOrEqual(1);
  expect(api.session().active).toBe(active);
});
