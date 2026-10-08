import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ViewerRoot } from "../../primitives/root";
import type { EditorApi, Layer, LayerId, Point } from "../api";
import type { DocStore } from "../doc/store";
import { applyUndo } from "../editor-api";
import { layerDecors, resetRegistry, tools } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { rasterSize } from "../text/raster";
import { registerTextShapes } from "../text/register";
import { ShapePanel } from "./panel";
import { defaultShapeStyle } from "./render";
import { shapeTool } from "./shape-tool";
import { shapeToolState } from "./tool-state";

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const mounted: (() => void)[] = [];

beforeEach(() => {
  resetRegistry();
  registerTextShapes();
  shapeToolState.set(defaultShapeStyle("Rectangle"));
});
afterEach(() => {
  for (const unmount of mounted.splice(0).toReversed()) unmount();
});

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
        <ShapePanel api={m.api} />
      </ViewerRoot>,
    ),
  );
  mounted.push(() => {
    root.unmount();
    host.remove();
  });
  m.api.setSession({ tool: "shape" });
  return m;
}

const ev = (shiftKey = false, altKey = false) => ({ shiftKey, altKey }) as PointerEvent;
function dragShape(api: EditorApi, a: Point, b: Point, shift = false): void {
  shapeTool.onPointerDown?.(a, ev(shift), api);
  shapeTool.onPointerMove?.(b, ev(shift), api);
  shapeTool.onPointerUp?.(b, ev(shift), api);
}
const layers = (api: EditorApi) => api.doc().manifest.layers;
const layerOf = (api: EditorApi, id: LayerId) => layers(api).find((l) => l.id === id) as Layer;
const top = (api: EditorApi) => layers(api).at(-1) as Layer;
const undo = (api: EditorApi, store: DocStore) =>
  applyUndo(api, store.undo() as NonNullable<ReturnType<DocStore["undo"]>>);
const pixel = (api: EditorApi, id: LayerId) =>
  Array.from(api.readRegion(id, "image", { x: 0, y: 0, ...rasterSize(api, id) }).slice(0, 4));
const colorInput = () => document.querySelector<HTMLInputElement>('input[type="color"]');

function pickColor(value: string): void {
  const el = colorInput();
  if (!el) throw new Error("no color input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("shape tool", () => {
  it("registers beside the text tool and the resize decor", () => {
    expect(tools().map((t) => t.id)).toEqual(expect.arrayContaining(["text", "shape"]));
    expect(layerDecors().map((d) => d.id)).toContain("shape-resize");
  });

  it("drags out a rectangle, an ellipse and a line", async () => {
    const { api } = await setup();
    for (const kind of ["Rectangle", "Ellipse", "Line"] as const) {
      shapeToolState.set(defaultShapeStyle(kind));
      dragShape(api, { x: 20, y: 30 }, { x: 120, y: 90 });
      expect(top(api).shape?.kind).toBe(kind);
      expect(top(api).name).toBe(kind === "Line" ? "Line" : kind);
    }
    expect(top(api).shape?.start).toBeDefined();
  });

  it("makes a square with Shift", async () => {
    const { api } = await setup();
    dragShape(api, { x: 20, y: 30 }, { x: 120, y: 50 }, true);
    const [w, h] = top(api).transform.size;
    expect(w).toBe(h);
  });

  it("makes no layer for a drag under 2 px", async () => {
    const { api } = await setup();
    dragShape(api, { x: 20, y: 30 }, { x: 21, y: 30.5 });
    expect(layers(api)).toHaveLength(1);
  });

  it("edits the selected shape from the panel, one undo step each", async () => {
    const { api, store } = await setup();
    dragShape(api, { x: 20, y: 30 }, { x: 120, y: 90 });
    const id = top(api).id;

    pickColor("#ff0000");
    await vi.waitFor(() => expect(layerOf(api, id).shape?.red).toBe(1));
    expect(pixel(api, id)).toEqual([255, 0, 0, 255]);

    await userEvent.fill(page.getByRole("textbox", { name: "Corner radius" }), "20");
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(layerOf(api, id).shape?.cornerRadius).toBe(20));
    expect(pixel(api, id)[3]).toBe(0);

    await userEvent.click(page.getByRole("button", { name: "Line" }));
    await vi.waitFor(() => expect(layerOf(api, id).shape?.kind).toBe("Line"));
    await userEvent.fill(page.getByRole("textbox", { name: "Line width" }), "9");
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(layerOf(api, id).shape?.lineWidth).toBe(9));

    undo(api, store);
    expect(layerOf(api, id).shape?.lineWidth).toBe(4);
    undo(api, store);
    expect(layerOf(api, id).shape?.kind).toBe("Rectangle");
    undo(api, store);
    expect(layerOf(api, id).shape?.cornerRadius).toBe(0);
    undo(api, store);
    expect(layerOf(api, id).shape?.red).toBe(0);
  });

  it("redraws through the registered decor after a size change", async () => {
    const { api } = await setup();
    dragShape(api, { x: 20, y: 30 }, { x: 120, y: 90 });
    const id = top(api).id;
    const before = top(api).transform;
    const { patchLayer } = await import("../doc/commands/layers");
    api.dispatch(patchLayer(id, { transform: { ...before, size: [200, 120] } }));
    layerDecors()
      .find((d) => d.id === "shape-resize")
      ?.onTransformEnd?.(id, before, api);
    expect(api.pixelSize(id, "image")).toEqual({ width: 200, height: 120 });
  });
});
