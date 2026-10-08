import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { EditorApi } from "../../api";
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

const tick = () => new Promise((r) => setTimeout(r, 0));
const mod = isMac() ? { metaKey: true } : { ctrlKey: true };
const px = (api: EditorApi, id: string, x: number, y: number) => [
  ...api.readRegion(id, "image", { x, y, width: 1, height: 1 }),
];

it("fills foreground on the left to background on the right in one undo step", async () => {
  await page.viewport(1000, 700);
  const doc = makeDoc({ width: 64, height: 64, layers: [{}] });
  const id = doc.manifest.layers[0]!.id;
  const { api, store, unmount } = await mountEditor(doc, { [id]: [255, 0, 0, 255] });
  mounted.push(unmount);
  api.setSession({ tool: "paint.gradient" });
  const tool = tools().find((t) => t.id === "paint.gradient")!;
  const pos = store.position();
  tool.onPointerDown?.({ x: 8, y: 32 }, new PointerEvent("pointerdown"), api);
  tool.onPointerMove?.({ x: 40, y: 20 }, new PointerEvent("pointermove"), api);
  tool.onPointerUp?.({ x: 56, y: 32 }, new PointerEvent("pointerup"), api);
  await tick();
  expect(px(api, id, 2, 10)).toEqual([0, 0, 0, 255]);
  expect(px(api, id, 60, 50)).toEqual([255, 255, 255, 255]);
  const mid = px(api, id, 32, 32);
  expect(mid[0]).toBeGreaterThan(100);
  expect(mid[0]).toBeLessThan(155);
  expect(store.position()).toBe(pos + 1);
  fireEvent.keyDown(document.body, { key: "z", ...mod });
  expect(px(api, id, 2, 10)).toEqual([255, 0, 0, 255]);
  expect(px(api, id, 60, 50)).toEqual([255, 0, 0, 255]);
});
