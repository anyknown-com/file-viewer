import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditorApi } from "../../api";
import { resetRegistry, tools } from "../../registry";
import { makeDoc } from "../../test/make-doc";
import { mountCanvas } from "../../test/mount-canvas";
import { registerSelectPaint } from "../register";
import { toolState } from "../state";
import { readSelection } from "./mask";
import { runWand, setWandOptions } from "./wand-tool";

// 10 step 4's `mountEditor` is not committed yet, so this drives the tool spec on `mountCanvas`.
const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const size = (x: number, w: number) => ({
  origin: [x, 0] as [number, number],
  size: [w, 100] as [number, number],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality" as const,
});

// Bottom layer is red over the whole canvas; the top layer is blue over the left half only.
async function setup() {
  const doc = makeDoc({
    width: 100,
    height: 100,
    layers: [{ transform: size(0, 100) }, { transform: size(0, 50) }],
  });
  const [bottom, top] = doc.manifest.layers;
  const m = await mountCanvas(doc, {
    [bottom.id]: [255, 0, 0, 255],
    [top.id]: [0, 0, 255, 255],
  });
  mounted.push(m.unmount);
  return { ...m, bottom, top };
}
const none = { shiftKey: false, altKey: false };
const at = (api: EditorApi, x: number, y: number) => readSelection(api)[y * 100 + x];

it("registers the wand tool with the W key", () => {
  expect(tools().find((t) => t.id === "select.wand")?.key).toBe("W");
});

it("samples all layers: clicking the blue half selects only the left half", async () => {
  const { api } = await setup();
  setWandOptions(api, { sampleAll: true });
  await runWand(api, { x: 10, y: 50 }, none);
  expect(at(api, 10, 50)).toBe(255);
  expect(at(api, 40, 10)).toBe(255);
  expect(at(api, 70, 50)).toBe(0);
});

it("samples the current layer: the bottom layer is one color, so everything is selected", async () => {
  const { api, bottom } = await setup();
  api.setSession({ active: bottom.id });
  setWandOptions(api, { sampleAll: false });
  await runWand(api, { x: 10, y: 50 }, none);
  expect(at(api, 10, 50)).toBe(255);
  expect(at(api, 90, 90)).toBe(255);
});

it("maps a result in layer space back to the document", async () => {
  const { api, top } = await setup();
  api.setSession({ active: top.id });
  setWandOptions(api, { sampleAll: false });
  await runWand(api, { x: 10, y: 50 }, none);
  expect(at(api, 25, 50)).toBe(255);
  expect(at(api, 75, 50)).toBe(0);
});

it("leaves the selection unchanged when the job is aborted before the worker answers", async () => {
  const { api } = await setup();
  setWandOptions(api, { sampleAll: true });
  await runWand(api, { x: 10, y: 50 }, none);
  const before = readSelection(api);
  vi.spyOn(api, "runInWorker").mockImplementation(
    (_job, _transfer, signal) =>
      new Promise((_, reject) =>
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      ),
  );
  const pending = runWand(api, { x: 70, y: 50 }, none);
  expect(toolState(api).job?.label).toBe("image.select.working");
  toolState(api).job?.abort();
  await pending;
  expect(toolState(api).job).toBeNull();
  expect(readSelection(api)).toEqual(before);
});
