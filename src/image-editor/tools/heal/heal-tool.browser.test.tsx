import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { EditorApi } from "../../api";
import { resetRegistry, tools } from "../../registry";
import { makeDoc } from "../../test/make-doc";
import { mountEditor } from "../../test/mount-editor";
import { registerSelectPaint } from "../register";
import { setToolState, toolState } from "../state";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerSelectPaint();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const WHOLE = { x: 0, y: 0, width: 48, height: 48 };

/** A 48 × 48 red layer with a 4 × 4 blue blemish at (22, 22). */
async function setup() {
  await page.viewport(1000, 700);
  const doc = makeDoc({ width: 48, height: 48, layers: [{}] });
  const id = doc.manifest.layers[0]!.id;
  const m = await mountEditor(doc, { [id]: [255, 0, 0, 255] });
  mounted.push(m.unmount);
  const blue = new Uint8Array(16 * 4);
  for (let i = 0; i < blue.length; i += 4) blue.set([0, 0, 255, 255], i);
  m.api.writeRegion(id, "image", { x: 22, y: 22, width: 4, height: 4 }, blue);
  m.api.setSession({ tool: "paint.heal", active: id });
  setToolState(m.api, { brush: { ...toolState(m.api).brush, size: 8, hardness: 1 } });
  return { ...m, id };
}

function dot(api: EditorApi, x: number, y: number): void {
  const t = tools().find((s) => s.id === "paint.heal")!;
  t.onPointerDown?.({ x, y }, new PointerEvent("pointerdown"), api);
  t.onPointerUp?.({ x, y }, new PointerEvent("pointerup"), api);
}

it("heals a dot in the worker as one undo step", async () => {
  const { api, id, store } = await setup();
  const pos = store.position();
  dot(api, 24, 24);
  await expect.poll(() => store.position(), { timeout: 10_000 }).toBe(pos + 1);
  const [r, , b] = api.readRegion(id, "image", { x: 24, y: 24, width: 1, height: 1 });
  expect(r).toBeGreaterThan(200);
  expect(b).toBeLessThan(60);
});

it("changes nothing when Stop is pressed before the job comes back", async () => {
  const { api, id, store } = await setup();
  const before = api.readRegion(id, "image", WHOLE);
  const pos = store.position();
  vi.spyOn(api, "runInWorker").mockImplementation(
    (_job, _transfer, signal) =>
      new Promise((_, reject) =>
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      ),
  );
  dot(api, 24, 24);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => toolState(api).job).toBeNull();
  expect(api.readRegion(id, "image", WHOLE)).toEqual(before);
  expect(store.position()).toBe(pos);
});
