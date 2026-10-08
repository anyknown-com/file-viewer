import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { LayerTextStyle } from "../../comp/index";
import { ViewerRoot } from "../../primitives/root";
import type { EditorApi, Layer, LayerId } from "../api";
import type { DocStore } from "../doc/store";
import { applyUndo } from "../editor-api";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { beginEdit, textEditing } from "./edit-state";
import { createTextLayer } from "./layer";
import { TextPanel } from "./panel";
import { registerTextShapes } from "./register";
import { defaultTextStyle } from "./style";
import { textTool } from "./type-tool";

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const mounted: (() => void)[] = [];

beforeEach(() => {
  resetRegistry();
  registerTextShapes();
  textEditing.set(null);
});
afterEach(() => {
  for (const unmount of mounted.splice(0).toReversed()) unmount();
});

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function setup() {
  const doc = makeDoc({ width: 400, height: 300, layers: [{}] });
  const m = await mountCanvas(doc, { [doc.manifest.layers[0].id]: WHITE });
  mounted.push(m.unmount);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <ViewerRoot locale="en">
        <TextPanel api={m.api} />
      </ViewerRoot>,
    ),
  );
  mounted.push(() => {
    root.unmount();
    host.remove();
  });
  m.api.setSession({ tool: "text" });
  await frame();
  await frame();
  return m;
}

const esc = (api: EditorApi) =>
  textTool.onKeyDown?.(new KeyboardEvent("keydown", { key: "Escape" }), api);
const editor = () => document.querySelector<HTMLElement>(".fv-text-edit");
const layerOf = (api: EditorApi, id: LayerId) =>
  api.doc().manifest.layers.find((l) => l.id === id) as Layer | undefined;
const undo = (api: EditorApi, store: DocStore) =>
  applyUndo(api, store.undo() as NonNullable<ReturnType<DocStore["undo"]>>);
const colorInput = () => document.querySelector<HTMLInputElement>('input[type="color"]');

async function textLayer(api: EditorApi, patch: Partial<LayerTextStyle> = {}): Promise<LayerId> {
  const style = { ...defaultTextStyle("Hello world"), ...patch };
  return createTextLayer(api, { style, origin: [100, 100] });
}

/** Starts editing `id` with [start, end) selected. */
async function edit(api: EditorApi, id: LayerId, start: number, end: number): Promise<void> {
  beginEdit(api, id);
  await vi.waitFor(() => expect(editor()).not.toBeNull());
  const ed = textEditing.get();
  if (ed) textEditing.set({ ...ed, selection: [start, end] });
}

/** Picks a color the way the native picker does: input events, then change. */
function pickColor(value: string): void {
  const el = colorInput();
  if (!el) throw new Error("no color input");
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function pickWeight(name: string): Promise<void> {
  await userEvent.click(page.getByRole("combobox", { name: "Weight" }));
  await userEvent.click(page.getByRole("option", { name, exact: true }));
}

it("colors only the selected words while editing", async () => {
  const { api } = await setup();
  const id = await textLayer(api);
  await edit(api, id, 6, 11);
  pickColor("#ff0000");
  esc(api);
  await vi.waitFor(() =>
    expect(layerOf(api, id)?.text?.colorRuns).toEqual([
      { location: 6, length: 5, red: 1, green: 0, blue: 0 },
    ]),
  );
  expect(layerOf(api, id)?.text?.red).toBe(0);
});

it("sets the weight of the selected words while editing", async () => {
  const { api } = await setup();
  const id = await textLayer(api);
  await edit(api, id, 0, 5);
  await pickWeight("Bold");
  esc(api);
  await vi.waitFor(() =>
    expect(layerOf(api, id)?.text?.fontRuns).toEqual([
      { location: 0, length: 5, fontName: "Geist-Bold" },
    ]),
  );
  expect(layerOf(api, id)?.text?.fontName).toBe("Geist-Regular");
});

it("sets the whole text's weight with no selection and drops the font runs", async () => {
  const { api } = await setup();
  const id = await textLayer(api, {
    fontRuns: [{ location: 0, length: 5, fontName: "Geist-Bold" }],
  });
  await edit(api, id, 3, 3);
  await pickWeight("Light");
  esc(api);
  await vi.waitFor(() => expect(layerOf(api, id)?.text?.fontName).toBe("Geist-Light"));
  expect(layerOf(api, id)?.text?.fontRuns).toBeUndefined();
});

it("re-renders a selected text layer once when its size is committed", async () => {
  const { api, store } = await setup();
  const id = await textLayer(api);
  const size = layerOf(api, id)?.transform.size ?? [0, 0];
  const before = store.position();
  const input = page.getByRole("textbox", { name: "Size" });
  await userEvent.fill(input, "96");
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(layerOf(api, id)?.text?.fontSize).toBe(96));
  await frame();
  expect(store.position()).toBe(before + 1);
  const [w, h] = layerOf(api, id)?.transform.size ?? [0, 0];
  expect(w).toBeGreaterThan(size[0]);
  expect(h).toBeGreaterThan(size[1]);
  undo(api, store);
  expect(layerOf(api, id)?.transform.size).toEqual(size);
});

it("turns auto leading off to 120% of the size", async () => {
  const { api } = await setup();
  const id = await textLayer(api);
  await userEvent.click(page.getByRole("switch", { name: "Auto" }));
  await vi.waitFor(() => expect(layerOf(api, id)?.text?.leading).toBe(58));
  expect(page.getByRole("textbox", { name: "Leading" }).element()).toBeTruthy();
});

it("says when the browser can't apply tracking", async () => {
  const proto = OffscreenCanvasRenderingContext2D.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "letterSpacing");
  if (!desc) throw new Error("letterSpacing is not on the prototype");
  Reflect.deleteProperty(proto, "letterSpacing");
  try {
    await setup();
    expect(document.body.textContent).toContain("This browser can't apply tracking.");
  } finally {
    Object.defineProperty(proto, "letterSpacing", desc);
  }
});

// Last: it changes the module-level style for new text.
it("gives the next new text the color picked with no text layer", async () => {
  const { api } = await setup();
  expect(document.body.textContent).not.toContain("This browser can't apply tracking.");
  pickColor("#00ff00");
  textTool.onPointerDown?.({ x: 50, y: 50 }, new PointerEvent("pointerdown"), api);
  textTool.onPointerUp?.({ x: 50, y: 50 }, new PointerEvent("pointerup"), api);
  await vi.waitFor(() => expect(editor()).not.toBeNull());
  await userEvent.keyboard("Hi");
  esc(api);
  await vi.waitFor(() =>
    expect(api.doc().manifest.layers.find((l) => l.text)?.text).toMatchObject({
      content: "Hi",
      red: 0,
      green: 1,
      blue: 0,
    }),
  );
});
