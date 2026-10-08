import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { EditorApi } from "../../api";
import { undo } from "../../layer-ops";
import { resetRegistry, tools } from "../../registry";
import { isMac } from "../../shortcut";
import { makeDoc } from "../../test/make-doc";
import { mountEditor } from "../../test/mount-editor";
import { registerSelectPaint } from "../register";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const key = (k: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.body, { key: k, ...init });
const px = (api: EditorApi, id: string, x: number, y: number) => [
  ...api.readRegion(id, "image", { x, y, width: 1, height: 1 }),
];

async function setup(layers: Parameters<typeof makeDoc>[0]["layers"] = [{}, {}]) {
  await page.viewport(1400, 900);
  const doc = makeDoc({ width: 64, height: 64, layers });
  const m = await mountEditor(
    doc,
    Object.fromEntries(doc.manifest.layers.map((l) => [l.id, [0, 0, 255, 255] as never])),
  );
  mounted.push(m.unmount);
  const rect = tools().find((t) => t.id === "select.rect");
  rect?.onPointerDown?.({ x: 28, y: 28 }, new PointerEvent("pointerdown"), m.api);
  rect?.onPointerUp?.({ x: 36, y: 36 }, new PointerEvent("pointerup"), m.api);
  return { ...m, id: m.api.session().active as string };
}

it("clears the selected pixels on Delete in one undo step and keeps the layer", async () => {
  const { api, id, store } = await setup();
  const layers = api.doc().manifest.layers.length;
  const pos = store.position();
  key("Delete");
  expect(px(api, id, 30, 30)[3]).toBe(0);
  expect(px(api, id, 10, 10)).toEqual([0, 0, 255, 255]);
  expect(api.doc().manifest.layers.length).toBe(layers);
  expect(store.position()).toBe(pos + 1);
  undo(api);
  expect(px(api, id, 30, 30)).toEqual([0, 0, 255, 255]);
});

it("deletes the layer on Backspace once the selection is gone", async () => {
  const { api } = await setup();
  const layers = api.doc().manifest.layers.length;
  key("d", isMac() ? { metaKey: true } : { ctrlKey: true });
  key("Backspace");
  expect(api.doc().manifest.layers.length).toBe(layers - 1);
});

it("asks before rasterizing a text layer, and changes nothing on cancel", async () => {
  const { api, id } = await setup([{}, { text: { content: "hi" } as never }]);
  key("Delete");
  const cancel = await page.getByRole("button", { name: "Cancel" }).element();
  expect(document.body.textContent).toContain("Rasterize this layer?");
  fireEvent.click(cancel);
  await new Promise((r) => setTimeout(r, 100));
  expect(px(api, id, 30, 30)).toEqual([0, 0, 255, 255]);
  expect(api.doc().manifest.layers.find((l) => l.id === id)?.text).toBeDefined();
});
