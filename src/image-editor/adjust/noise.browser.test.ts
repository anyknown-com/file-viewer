import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AdjustmentKind, AdjustmentSettings, Mat2D } from "../api";
import { createTarget } from "../engine/gl/target";
import { readTexture } from "../engine/gl/read";
import { adjustment, resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { registerNoiseAdjustments } from "./register-noise";
import { defaultAdjustment } from "./settings";

const SIZE = 64;
const GRAY: [number, number, number, number] = [128, 128, 128, 255];
const FULL = { x: 0, y: 0, width: SIZE, height: SIZE };
const mounted: (() => void)[] = [];

beforeEach(() => {
  resetRegistry();
  registerNoiseAdjustments();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

function settings(kind: AdjustmentKind, seed: number): AdjustmentSettings {
  const s = defaultAdjustment(kind, seed);
  // Strong enough that every pixel moves off 50% gray.
  if (kind === "Grain")
    return { ...s, grainSettings: { amount: 100, size: 3, roughness: 50, seed } };
  return { ...s, noiseAmount: 40 };
}

/** 64 × 64, 50% gray under one noise layer; `readComposite` of `rect`. */
async function render(s: AdjustmentSettings, rect = FULL): Promise<Uint8Array> {
  const doc = makeDoc({ width: SIZE, height: SIZE, layers: [{}, { adjustment: s }] });
  const m = await mountCanvas(doc, { [doc.manifest.layers[0].id]: GRAY });
  mounted.push(m.unmount);
  m.api.requestRender();
  return m.api.readComposite(rect);
}

/** The registered pass run straight on a 64 × 64 gray texture with `docFromPx`. */
async function pass(s: AdjustmentSettings, docFromPx: Mat2D): Promise<Uint8Array> {
  const doc = makeDoc({ width: SIZE, height: SIZE, layers: [{}] });
  const m = await mountCanvas(doc);
  mounted.push(m.unmount);
  const gl = m.api.gl;
  const src = createTarget(gl, SIZE, SIZE, "rgba8");
  const dst = createTarget(gl, SIZE, SIZE, "rgba8");
  gl.bindFramebuffer(gl.FRAMEBUFFER, src.framebuffer);
  gl.viewport(0, 0, SIZE, SIZE);
  gl.clearColor(128 / 255, 128 / 255, 128 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const view = { scale: 1, width: SIZE, height: SIZE, docFromPx, forExport: true };
  adjustment(s.kind)?.pass?.(gl, src.texture, dst.framebuffer, s, view);
  const out = readTexture(gl, dst.texture, FULL, 4);
  src.dispose();
  dst.dispose();
  return out;
}

/** Bytes of `rect` cut out of a 64-wide RGBA image. */
function crop(rgba: Uint8Array, rect: { x: number; y: number; width: number; height: number }) {
  const out = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * SIZE + rect.x) * 4;
    out.set(rgba.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return out;
}

describe.each(["Add Noise", "Grain"] as const)("%s", (kind) => {
  it("draws the same pattern for the same seed and another for another seed", async () => {
    const a = await render(settings(kind, 7));
    const b = await render(settings(kind, 7));
    const c = await render(settings(kind, 8));
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
    // The noise is there at all: not every pixel is left at the gray it started from.
    expect(a.some((v, i) => i % 4 !== 3 && Math.abs(v - 128) > 2)).toBe(true);
  });

  it("samples by document position: a sub-rectangle reads what the whole shows there", async () => {
    const rect = { x: 16, y: 16, width: 32, height: 32 };
    const whole = await render(settings(kind, 7));
    const part = await render(settings(kind, 7), rect);
    expect(part).toEqual(crop(whole, rect));
  });

  it("moves with docFromPx: a translation by (8, 8) shifts the output by 8 px", async () => {
    const s = settings(kind, 7);
    const still = await pass(s, [1, 0, 0, 1, 0, 0]);
    const moved = await pass(s, [1, 0, 0, 1, 8, 8]);
    const overlap = { width: SIZE - 8, height: SIZE - 8 };
    expect(crop(moved, { x: 0, y: 0, ...overlap })).toEqual(
      crop(still, { x: 8, y: 8, ...overlap }),
    );
    expect(moved).not.toEqual(still);
  });
});

// NoisePixels.c's uniform noise on the CPU. The GPU path stores the result in an RGBA16F surface
// (2^-11 relative error near 0.5, about 0.12 of an 8-bit step) and reads it back rounded to 8 bits,
// so any GPU lands within 1/255 of this.
const mix32 = (v: number): number => {
  let x = v >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};
const unit = (key: number): number => (mix32(key) >>> 8) / 16777216;

it("Add Noise matches NoisePixels.c's uniform noise within 1/255", async () => {
  const seed = 7;
  const amount = 40;
  const got = await render(settings("Add Noise", seed));
  const spread = (amount / 100) * 127.5;
  let worst = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const inner = mix32(Math.imul(x, 0x9e3779b9) ^ mix32(Math.imul(y, 0x85ebca6b)));
      const base = mix32(seed ^ inner);
      for (let c = 0; c < 3; c++) {
        const key = (base + Math.imul(c, 0x9e3779b9)) >>> 0;
        const want = Math.min(255, Math.max(0, 128 + (unit(key) * 2 - 1) * spread));
        worst = Math.max(worst, Math.abs(got[(y * SIZE + x) * 4 + c] - want));
      }
    }
  }
  expect(worst).toBeLessThanOrEqual(1);
});
