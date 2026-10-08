import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AdjustmentKind, AdjustmentSettings, Mat2D, Rect } from "../api";
import { readTexture } from "../engine/gl/read";
import { createTarget } from "../engine/gl/target";
import { adjustment, resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { blurReach } from "./reach";
import { registerBlurAdjustments } from "./register-blur";
import { defaultAdjustment } from "./settings";

const mounted: (() => void)[] = [];

beforeEach(() => {
  resetRegistry();
  registerBlurAdjustments();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const blur = (kind: AdjustmentKind, patch: Partial<AdjustmentSettings>): AdjustmentSettings => ({
  ...defaultAdjustment(kind, 0),
  ...patch,
});

/** A `size`² canvas: `pixels` (RGBA8) on the bottom layer, `s` above it; `read` the composite. */
async function mount(size: number, s: AdjustmentSettings, pixels: Uint8Array) {
  const doc = makeDoc({ width: size, height: size, layers: [{}, { adjustment: s }] });
  const m = await mountCanvas(doc);
  mounted.push(m.unmount);
  m.api.writeRegion(
    doc.manifest.layers[0].id,
    "image",
    { x: 0, y: 0, width: size, height: size },
    pixels,
  );
  m.api.requestRender();
  return (rect: Rect) => m.api.readComposite(rect);
}

/** 64 × 64 opaque black with one white pixel at (32, 32). */
function dot(): Uint8Array {
  const px = new Uint8Array(64 * 64 * 4);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  px.fill(255, (32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 3);
  return px;
}

const FULL64 = { x: 0, y: 0, width: 64, height: 64 };

describe("Gaussian Blur", () => {
  it("matches a CPU Gaussian with σ = 3 within 2/255", async () => {
    const got = await (await mount(64, blur("Gaussian Blur", { blurRadius: 3 }), dot()))(FULL64);
    const sigma = 3;
    const radius = Math.ceil(3 * sigma);
    const raw = Array.from({ length: 2 * radius + 1 }, (_, i) =>
      Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)),
    );
    const total = raw.reduce((a, b) => a + b, 0);
    const w = (d: number) => (Math.abs(d) > radius ? 0 : raw[d + radius] / total);
    let worst = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const want = 255 * w(x - 32) * w(y - 32);
        for (let c = 0; c < 3; c++)
          worst = Math.max(worst, Math.abs(got[(y * 64 + x) * 4 + c] - want));
      }
    }
    expect(worst).toBeLessThanOrEqual(2);
    // Not clamped, as on Compositor's canvas: past the edge is transparent, so the corner thins.
    expect(got[(32 * 64 + 32) * 4 + 3]).toBe(255);
    expect(got[3]).toBeLessThan(255);
  });

  // Run straight through the registered pass: 10's composite samples its accumulator with
  // `texture()` at px / size, which on tile sizes that are not powers of two moves half-float
  // values by a fraction of a step, so readComposite tiles can flip an 8-bit rounding.
  it("renders the same in four tiles (each with blurReach of margin) as in one", async () => {
    const size = 256;
    const s = blur("Gaussian Blur", { blurRadius: 8 });
    let seed = 1;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed >>> 24;
    };
    const pixels = new Uint8Array(size * size * 4).map((_, i) => (i % 4 === 3 ? 255 : random()));
    const run = await passOn(s, pixels, size);
    const whole = run({ x: 0, y: 0, width: size, height: size });
    const reach = blurReach(s, 1);
    expect(reach).toBe(24);
    const tiled = new Uint8Array(whole.length);
    const half = size / 2;
    for (const [tx, ty] of [
      [0, 0],
      [half, 0],
      [0, half],
      [half, half],
    ]) {
      const x0 = Math.max(0, tx - reach);
      const y0 = Math.max(0, ty - reach);
      const x1 = Math.min(size, tx + half + reach);
      const y1 = Math.min(size, ty + half + reach);
      const tile = run({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      for (let y = 0; y < half; y++) {
        const from = ((ty + y - y0) * (x1 - x0) + (tx - x0)) * 4;
        tiled.set(tile.subarray(from, from + half * 4), ((ty + y) * size + tx) * 4);
      }
    }
    expect(tiled).toEqual(whole);
  });
});

/** `run(rect)`: the registered pass over `rect` of a `size`-wide RGBA8 image, as 10 calls it. */
async function passOn(s: AdjustmentSettings, pixels: Uint8Array, size: number) {
  const m = await mountCanvas(makeDoc({ width: size, height: size, layers: [{}] }));
  mounted.push(m.unmount);
  const gl = m.api.gl;
  return (rect: Rect): Uint8Array => {
    const { x, y, width, height } = rect;
    const part = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) {
      const from = ((y + row) * size + x) * 4;
      part.set(pixels.subarray(from, from + width * 4), row * width * 4);
    }
    const src = createTarget(gl, width, height, "rgba8");
    const dst = createTarget(gl, width, height, "rgba8");
    gl.bindTexture(gl.TEXTURE_2D, src.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, part);
    const view = {
      scale: 1,
      width,
      height,
      docFromPx: [1, 0, 0, 1, x, y] as Mat2D,
      forExport: true,
    };
    adjustment(s.kind)?.pass?.(gl, src.texture, dst.framebuffer, s, view);
    const out = readTexture(gl, dst.texture, { x: 0, y: 0, width, height }, 4);
    src.dispose();
    dst.dispose();
    return out;
  };
}

describe("Motion Blur", () => {
  it("at angle 0 spreads a dot only sideways", async () => {
    const s = blur("Motion Blur", { motionAngle: 0, motionDistance: 10 });
    const got = await (await mount(64, s, dot()))(FULL64);
    const row = (y: number) => got.subarray(y * 64 * 4, (y + 1) * 64 * 4);
    const lit = (y: number) => row(y).filter((v, i) => i % 4 !== 3 && v > 0).length;
    expect(lit(31)).toBe(0);
    expect(lit(33)).toBe(0);
    expect(lit(32)).toBeGreaterThan(3 * 5);
  });
});

describe("blurReach", () => {
  it("halves at scale 0.5 and is 0 for other kinds", () => {
    const gauss = blur("Gaussian Blur", { blurRadius: 8 });
    const motion = blur("Motion Blur", { motionDistance: 40 });
    expect(blurReach(gauss, 1)).toBe(24);
    expect(blurReach(gauss, 0.5)).toBe(12);
    expect(blurReach(motion, 1)).toBe(20);
    expect(blurReach(motion, 0.5)).toBe(10);
    expect(blurReach(defaultAdjustment("Invert", 0), 1)).toBe(0);
  });
});
