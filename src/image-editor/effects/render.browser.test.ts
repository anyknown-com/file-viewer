import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerEffects } from "../../comp/index";
import type { Layer, Mat2D, Rect } from "../api";
import { createTarget } from "../engine/gl/target";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { defaultEffect } from "./defaults";
import { runEffectPasses } from "./passes";
import { effectsReach } from "./reach";
import { registerLayerEffects } from "./register";
import { cachedEffects, previewLongSide, renderEffects } from "./render";

vi.mock("./passes", { spy: true });

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerLayerEffects();
  vi.mocked(runEffectPasses).mockClear();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const CENTER = {
  origin: [50, 50] as [number, number],
  size: [100, 100] as [number, number],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling: "High quality" as const,
};
const RED: [number, number, number, number] = [255, 0, 0, 255];

/** A 200 × 200 canvas with a red 100 × 100 layer in the middle carrying `effects`. */
async function mount(effects: LayerEffects | undefined) {
  const doc = makeDoc({ width: 200, height: 200, layers: [{ transform: CENTER, effects }] });
  const id = doc.manifest.layers[0].id;
  const m = await mountCanvas(doc, { [id]: RED });
  mounted.push(m.unmount);
  return { ...m, read: (rect: Rect) => m.api.readComposite(rect) };
}
const FULL = { x: 0, y: 0, width: 200, height: 200 };

describe("renderEffects on the canvas", () => {
  it("draws switched-off effects as nothing and keeps their settings", async () => {
    const off: LayerEffects = {
      stroke: { ...defaultEffect("stroke"), size: 10, enabled: false },
      outerGlow: { ...defaultEffect("outerGlow"), size: 20, enabled: false },
    };
    const plain = (await mount(undefined)).read(FULL);
    const m = await mount(off);
    expect(m.read(FULL)).toEqual(plain);
    expect(m.api.doc().manifest.layers[0].effects?.stroke?.size).toBe(10);
    const on = await mount({ stroke: { ...defaultEffect("stroke"), size: 10 } });
    expect(on.read(FULL)).not.toEqual(plain);
  });

  it("renders an outer glow of 20 the same in four tiles as in one", async () => {
    const effects: LayerEffects = { outerGlow: { ...defaultEffect("outerGlow"), size: 20 } };
    const { read } = await mount(effects);
    const whole = read(FULL);
    const reach = effectsReach(effects, 1);
    expect(reach).toBe(30);
    const tiled = new Uint8Array(whole.length);
    for (const [tx, ty] of [
      [0, 0],
      [100, 0],
      [0, 100],
      [100, 100],
    ]) {
      const x0 = Math.max(0, tx - reach);
      const y0 = Math.max(0, ty - reach);
      const x1 = Math.min(200, tx + 100 + reach);
      const y1 = Math.min(200, ty + 100 + reach);
      const tile = read({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      for (let y = 0; y < 100; y++) {
        const from = ((ty + y - y0) * (x1 - x0) + (tx - x0)) * 4;
        tiled.set(tile.subarray(from, from + 400), ((ty + y) * 200 + tx) * 4);
      }
    }
    expect(tiled).toEqual(whole);
  });
});

const view = (scale: number, width: number, height: number, forExport: boolean) => ({
  scale,
  width,
  height,
  docFromPx: [1 / scale, 0, 0, 1 / scale, 0, 0] as Mat2D,
  forExport,
  version: 0,
});
const calls = () => vi.mocked(runEffectPasses).mock.calls;

describe("renderEffects called directly", () => {
  const maybe = document.createElement("canvas").getContext("webgl2");
  if (!maybe) throw new Error("no webgl2");
  const gl = maybe;
  const effects: LayerEffects = { outerGlow: { ...defaultEffect("outerGlow"), size: 20 } };
  const layer: Layer = makeDoc({ width: 100, height: 100, layers: [{ effects }] }).manifest
    .layers[0];

  /** A `width` × `height` layer in output px and a target `pad` wider on each side. */
  function surfaces(width: number, height: number, pad: number) {
    const src = createTarget(gl, width, height, "rgba8");
    const out = createTarget(gl, width + 2 * pad, height + 2 * pad, "rgba8");
    return { src: src.texture, dst: { ...out, pad } };
  }
  it("runs the passes once while the version and settings stay the same", () => {
    const { src, dst } = surfaces(100, 100, 30);
    const v = view(1, 100, 100, false);
    renderEffects(gl, layer, src, dst, v);
    renderEffects(gl, layer, src, dst, v);
    expect(calls()).toHaveLength(1);
    renderEffects(gl, layer, src, dst, { ...v, version: 1 });
    expect(calls()).toHaveLength(2);
    const changed = { outerGlow: { ...defaultEffect("outerGlow"), size: 21 } };
    renderEffects(gl, { ...layer, effects: changed }, src, dst, { ...v, version: 1 });
    expect(calls()).toHaveLength(3);
    // The layer's older results made way for the newest.
    expect(cachedEffects(gl)).toBe(1);
  });

  it("runs the passes every time for export and leaves the cache alone", () => {
    const { src, dst } = surfaces(100, 100, 30);
    const before = cachedEffects(gl);
    const v = view(1, 100, 100, true);
    renderEffects(gl, layer, src, dst, v);
    renderEffects(gl, layer, src, dst, v);
    expect(calls()).toHaveLength(2);
    expect(cachedEffects(gl)).toBe(before);
  });

  it("renders a big zoomed-out layer at full size for export and capped on screen", () => {
    const pad = effectsReach(effects, 0.25);
    const { src, dst } = surfaces(1600, 100, pad);
    renderEffects(gl, layer, src, dst, view(0.25, 1600, 100, true));
    const [, , size, out, , k] = calls()[0];
    expect(k).toBe(0.25);
    expect(size).toEqual({ width: 1600, height: 100 });
    expect([out.width - 2 * out.pad, out.height - 2 * out.pad]).toEqual([1600, 100]);

    renderEffects(gl, { ...layer, id: "BIG" }, src, dst, view(0.25, 1600, 100, false));
    const [, , , small, , kSmall] = calls()[1];
    const n = cachedEffects(gl);
    expect(small.width - 2 * small.pad).toBe(previewLongSide(n));
    expect(kSmall).toBeCloseTo((0.25 * previewLongSide(n)) / 1600, 6);
  });
});

describe("sizes", () => {
  it("caps the preview between 32 and 1536 px", () => {
    expect(previewLongSide(1)).toBe(1536);
    expect(previewLongSide(100_000)).toBe(32);
  });

  it("reaches as far as a shadow's distance plus three halves of its blur", () => {
    const shadow = { ...defaultEffect("shadow"), distance: 10, blur: 4 };
    expect(effectsReach({ shadow }, 1)).toBe(16);
    expect(effectsReach({ shadow: { ...shadow, enabled: false } }, 1)).toBe(0);
  });
});
