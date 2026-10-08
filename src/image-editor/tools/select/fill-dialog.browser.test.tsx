import { afterEach, beforeEach, expect, it } from "vitest";
import { undo } from "../../layer-ops";
import { resetRegistry, tools } from "../../registry";
import { makeDoc } from "../../test/make-doc";
import { mountCanvas } from "../../test/mount-canvas";
import { registerSelectPaint } from "../register";
import { setToolState } from "../state";
import { applyFill } from "./fill-dialog";

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
