import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { EditorApi, Layer } from "../../api";
import { resetRegistry, tools } from "../../registry";
import { isMac } from "../../shortcut";
import { makeDoc } from "../../test/make-doc";
import { mountEditor } from "../../test/mount-editor";
import { registerSelectPaint } from "../register";
import { setToolState, toolState } from "../state";
import { setCloneState } from "./clone";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const GREEN = [0, 255, 0, 255];
const tick = () => new Promise((r) => setTimeout(r, 0));
const mod = isMac() ? { metaKey: true } : { ctrlKey: true };
const px = (api: EditorApi, id: string, x: number, y: number) => [
  ...api.readRegion(id, "image", { x, y, width: 1, height: 1 }),
];

/** A 64 × 64 canvas whose first layer is red on the left half and blue on the right. */
async function setup(layers: Partial<Layer>[] = [{}], colors: Record<number, number[]> = {}) {
  await page.viewport(1000, 700);
  const doc = makeDoc({ width: 64, height: 64, layers });
  const ids = doc.manifest.layers.map((l) => l.id);
  const fills = Object.fromEntries(
    ids.map((id, i) => [id, (colors[i] ?? RED) as [number, number, number, number]]),
  );
  const m = await mountEditor(doc, fills);
  mounted.push(m.unmount);
  const blue = new Uint8Array(32 * 64 * 4);
  for (let i = 0; i < blue.length; i += 4) blue.set(BLUE, i);
  m.api.writeRegion(ids[0]!, "image", { x: 32, y: 0, width: 32, height: 64 }, blue);
  m.api.setSession({ tool: "paint.clone", active: ids[0]! });
  setToolState(m.api, { brush: { ...toolState(m.api).brush, size: 6, hardness: 1 } });
  return { ...m, id: ids[0]! };
}

const at = ([x, y]: [number, number]) => ({ x, y });

async function stroke(api: EditorApi, pts: [number, number][], alt = false) {
  const t = tools().find((x) => x.id === "paint.clone")!;
  t.onPointerDown?.(at(pts[0]!), new PointerEvent("pointerdown", { altKey: alt }), api);
  for (const p of pts.slice(1)) t.onPointerMove?.(at(p), new PointerEvent("pointermove"), api);
  t.onPointerUp?.(at(pts.at(-1)!), new PointerEvent("pointerup"), api);
  await tick();
}

it("copies the alt-clicked source under the brush in one undo step", async () => {
  const { api, id, store } = await setup();
  const pos = store.position();
  await stroke(api, [[48, 32]]);
  expect(store.position()).toBe(pos); // no source yet
  expect(px(api, id, 48, 32)).toEqual(BLUE);

  await stroke(api, [[12, 32]], true);
  await stroke(api, [
    [46, 32],
    [50, 32],
  ]);
  expect(px(api, id, 48, 32)).toEqual(RED);
  expect(px(api, id, 60, 10)).toEqual(BLUE);
  expect(store.position()).toBe(pos + 1);
  fireEvent.keyDown(document.body, { key: "z", ...mod });
  expect(px(api, id, 48, 32)).toEqual(BLUE);
});

it("copies the layers above when sampling all layers", async () => {
  const top: Partial<Layer> = {
    transform: {
      origin: [8, 28],
      size: [8, 8],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "High quality",
    },
  };
  const { api, id } = await setup([{}, top], { 1: GREEN });
  setCloneState(api, { sample: "all" });
  await stroke(api, [[12, 32]], true);
  await stroke(api, [
    [47, 32],
    [49, 32],
  ]);
  expect(px(api, id, 48, 32)).toEqual(GREEN);

  setCloneState(api, { sample: "layer", aligned: false });
  await stroke(api, [[48, 32]]);
  expect(px(api, id, 48, 32)).toEqual(RED);
});
