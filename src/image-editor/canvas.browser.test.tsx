import { afterEach, describe, expect, it, vi } from "vitest";
import type { Point, ToolSpec } from "./api";
import { registerOverlay, registerTool, resetRegistry } from "./registry";
import { makeDoc } from "./test/make-doc";
import { mountCanvas } from "./test/mount-canvas";

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  resetRegistry();
});

async function mount() {
  const m = await mountCanvas(makeDoc({ width: 200, height: 100, layers: [{}] }));
  mounted.push(m.unmount);
  const overlay = m.canvas.parentElement?.querySelector<HTMLCanvasElement>(".fv-ie-overlay");
  if (!overlay) throw new Error("no overlay");
  return { ...m, overlay };
}

function pointer(el: HTMLElement, type: string, x: number, y: number) {
  const r = el.getBoundingClientRect();
  const init = { clientX: r.left + x, clientY: r.top + y, pointerId: 1, button: 0, bubbles: true };
  el.dispatchEvent(new PointerEvent(type, init));
}

function probe(): Point[] {
  const seen: Point[] = [];
  const spec: ToolSpec = {
    id: "probe",
    key: "P",
    label: "image.notice.unsupported",
    icon: () => null,
    cursor: "crosshair",
    onPointerDown: (p) => seen.push(p),
  };
  registerTool(spec);
  return seen;
}

describe("EditorCanvas", () => {
  it("has a GL context while mounted and loses it on unmount", async () => {
    const { api, canvas, unmount } = await mountCanvas(
      makeDoc({ width: 4, height: 4, layers: [{}] }),
    );
    expect(api.gl).toBeInstanceOf(WebGL2RenderingContext);
    expect(canvas.isConnected).toBe(true);
    unmount();
    expect(api.gl.isContextLost()).toBe(true);
  });

  it("hands the tool document coordinates", async () => {
    const seen = probe();
    const { api, overlay } = await mount();
    api.setSession({ tool: "probe" });
    // 320 × 240 canvas, zoom 1, the document's center (100, 50) in the middle (160, 120).
    pointer(overlay, "pointerdown", 170, 125);
    expect(seen).toEqual([{ x: 110, y: 55 }]);
  });

  it("keeps the document point under the cursor when the wheel zooms", async () => {
    const seen = probe();
    const { api, overlay } = await mount();
    api.setSession({ tool: "probe" });
    pointer(overlay, "pointerdown", 60, 40);
    const r = overlay.getBoundingClientRect();
    const wheel = {
      clientX: r.left + 60,
      clientY: r.top + 40,
      deltaY: -200,
      bubbles: true,
      cancelable: true,
    };
    overlay.dispatchEvent(new WheelEvent("wheel", wheel));
    pointer(overlay, "pointerdown", 60, 40);
    pointer(overlay, "pointerdown", 61, 40);
    expect(seen[1].x).toBeCloseTo(seen[0].x, 6);
    expect(seen[1].y).toBeCloseTo(seen[0].y, 6);
    // Zoomed in: one CSS px is less than one document px now.
    expect(seen[2].x - seen[1].x).toBeLessThan(1);
  });

  it("redraws an animated overlay every frame", async () => {
    const times: number[] = [];
    registerOverlay({
      id: "ants",
      draw: (_ctx, _view, _api, time) => times.push(time),
      animated: () => true,
    });
    await mount();
    await vi.waitFor(() => expect(new Set(times).size).toBeGreaterThanOrEqual(2));
  });
});
