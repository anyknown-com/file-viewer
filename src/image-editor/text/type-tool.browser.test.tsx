import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { LayerTextStyle } from "../../comp/index";
import { ViewerRoot } from "../../primitives/root";
import type { EditorApi, Layer, LayerId } from "../api";
import type { DocStore } from "../doc/store";
import { applyUndo } from "../editor-api";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { textEditing } from "./edit-state";
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
  for (const unmount of mounted.splice(0).reverse()) unmount();
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
  // The tool records the view in drawOverlay, which only runs for the current tool.
  m.api.setSession({ tool: "text" });
  await frame();
  await frame();
  return m;
}

const pe = (type: string) => new PointerEvent(type);
function click(api: EditorApi, x: number, y: number) {
  textTool.onPointerDown?.({ x, y }, pe("pointerdown"), api);
  textTool.onPointerUp?.({ x, y }, pe("pointerup"), api);
}
function drag(api: EditorApi, a: [number, number], b: [number, number]) {
  textTool.onPointerDown?.({ x: a[0], y: a[1] }, pe("pointerdown"), api);
  textTool.onPointerMove?.({ x: b[0], y: b[1] }, pe("pointermove"), api);
  textTool.onPointerUp?.({ x: b[0], y: b[1] }, pe("pointerup"), api);
}
const esc = (api: EditorApi) =>
  textTool.onKeyDown?.(new KeyboardEvent("keydown", { key: "Escape" }), api);
const editor = () => document.querySelector<HTMLElement>(".fv-text-edit");
async function waitForEditor(): Promise<HTMLElement> {
  await vi.waitFor(() => expect(editor()).not.toBeNull());
  return editor() as HTMLElement;
}
const textLayers = (api: EditorApi) => api.doc().manifest.layers.filter((l) => l.text);
const layerOf = (api: EditorApi, id: LayerId) =>
  api.doc().manifest.layers.find((l) => l.id === id) as Layer | undefined;
const undo = (api: EditorApi, store: DocStore) =>
  applyUndo(api, store.undo() as NonNullable<ReturnType<DocStore["undo"]>>);
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === label);

async function textLayer(api: EditorApi, patch: Partial<LayerTextStyle> = {}): Promise<LayerId> {
  const style = { ...defaultTextStyle("Hello"), ...patch };
  return createTextLayer(api, { style, origin: [100, 100] });
}

it("adds point text on click, one undo step", async () => {
  const { api, store } = await setup();
  click(api, 50, 50);
  await waitForEditor();
  await userEvent.keyboard("Hi");
  expect(esc(api)).toBe(true);
  await vi.waitFor(() => expect(textLayers(api)).toHaveLength(1));
  expect(textLayers(api)[0]?.text?.content).toBe("Hi");
  expect(editor()).toBeNull();
  undo(api, store);
  expect(textLayers(api)).toHaveLength(0);
});

it("makes a paragraph box from a drag", async () => {
  const { api } = await setup();
  drag(api, [50, 50], [170, 110]);
  await waitForEditor();
  await userEvent.keyboard("Box");
  esc(api);
  await vi.waitFor(() => expect(textLayers(api)).toHaveLength(1));
  expect(textLayers(api)[0]?.text?.boxSize).toEqual([120, 60]);
});

it("pastes plain text only", async () => {
  const { api } = await setup();
  click(api, 50, 50);
  const el = await waitForEditor();
  const data = new DataTransfer();
  data.setData("text/html", "<b>x</b>");
  data.setData("text/plain", "x");
  el.dispatchEvent(
    new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
  );
  expect(textEditing.get()?.style.content).toBe("x");
  expect(el.textContent).toBe("x");
  expect(el.querySelector("b")).toBeNull();
});

it("hides an edited layer and records nothing when the text is unchanged", async () => {
  const { api, store } = await setup();
  const id = await textLayer(api);
  const before = store.position();
  click(api, 120, 120);
  await waitForEditor();
  expect(api.session().renderHidden.has(id)).toBe(true);
  esc(api);
  await vi.waitFor(() => expect(api.session().renderHidden.has(id)).toBe(false));
  expect(store.position()).toBe(before);
  expect(editor()).toBeNull();
});

it("asks before replacing a missing font", async () => {
  const { api, store } = await setup();
  const id = await textLayer(api, { fontName: "Helvetica-Bold" });
  const before = store.position();
  click(api, 120, 120);
  await vi.waitFor(() => expect(button("Cancel")).toBeDefined());
  expect(document.body.textContent).toContain('"Helvetica-Bold" isn\'t available here.');
  expect(editor()).toBeNull();
  button("Cancel")?.click();
  await vi.waitFor(() => expect(textEditing.get()).toBeNull());
  expect(api.session().renderHidden.has(id)).toBe(false);
  expect(store.position()).toBe(before);
  expect(layerOf(api, id)?.text?.fontName).toBe("Helvetica-Bold");

  click(api, 120, 120);
  await vi.waitFor(() => expect(button("Switch to Geist")).toBeDefined());
  button("Switch to Geist")?.click();
  await waitForEditor();
  expect(api.session().renderHidden.has(id)).toBe(true);
  esc(api);
  await vi.waitFor(() => expect(layerOf(api, id)?.text?.fontName).toBe("Geist-Regular"));
});

it("deletes a text layer emptied while editing, undoably", async () => {
  const { api, store } = await setup();
  const id = await textLayer(api);
  click(api, 120, 120);
  const el = await waitForEditor();
  document.getSelection()?.selectAllChildren(el);
  await userEvent.keyboard("{Backspace}");
  expect(textEditing.get()?.style.content).toBe("");
  esc(api);
  await vi.waitFor(() => expect(layerOf(api, id)).toBeUndefined());
  undo(api, store);
  expect(layerOf(api, id)?.text?.content).toBe("Hello");
});

it("ends editing when the tool changes", async () => {
  const { api } = await setup();
  click(api, 50, 50);
  await waitForEditor();
  await userEvent.keyboard("Yo");
  api.setSession({ tool: "move" });
  await vi.waitFor(() => expect(textLayers(api)).toHaveLength(1));
  expect(textLayers(api)[0]?.text?.content).toBe("Yo");
  await vi.waitFor(() => expect(editor()).toBeNull());
});
