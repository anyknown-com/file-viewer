import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdjustmentKind, AdjustmentSettings } from "../api";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { blackWhiteRgb, colorBalanceRgb, gradientMapRgb } from "./color-lut";
import { curvesLut } from "./curves";
import { exposureLut } from "./exposure";
import { hueSaturationRgb } from "./hue-saturation";
import { levelsLut } from "./levels";
import { cachedLut } from "./lut-texture";
import { LUT3D_SIZE } from "./lut3d";
import { registerLutAdjustments } from "./register-lut";
import { defaultAdjustment } from "./settings";

type Rgb = [number, number, number];
const mounted: (() => void)[] = [];

beforeEach(() => {
  resetRegistry();
  registerLutAdjustments();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const range = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };
const diagonal = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

function settings(kind: AdjustmentKind, patch: Partial<AdjustmentSettings>): AdjustmentSettings {
  return { ...defaultAdjustment(kind, 0), ...patch };
}

const LEVELS = settings("Levels", {
  levels: {
    channel: "RGB",
    ranges: [
      { ...range, black: 20, white: 230, gamma: 1.4, outputBlack: 10, outputWhite: 240 },
      { ...range, white: 200 },
      range,
      range,
    ],
  },
});
const CURVES = settings("Curves", {
  curves: {
    channel: "RGB",
    channels: [
      [
        { x: 0, y: 0 },
        { x: 64, y: 40 },
        { x: 192, y: 220 },
        { x: 255, y: 255 },
      ],
      diagonal,
      [
        { x: 0, y: 30 },
        { x: 255, y: 255 },
      ],
      diagonal,
    ],
  },
});
const EXPOSURE = settings("Exposure", {
  exposureSettings: { exposure: 0.7, offset: 0.02, gamma: 1.2 },
});

// Gray ramp 0–255 through a 1D LUT: the LUT read directly is the reference.
describe.each([
  ["Levels", LEVELS, levelsLut],
  ["Curves", CURVES, curvesLut],
  ["Exposure", EXPOSURE, exposureLut],
] as const)("%s", (_kind, s, build) => {
  it("matches the 1D LUT within 1/255", async () => {
    const lut = build(s);
    const ramp = new Uint8Array(256 * 4).map((_, i) => (i % 4 === 3 ? 255 : i >> 2));
    const want = Array.from(
      { length: 256 },
      (_, i): Rgb => [0, 1, 2].map((c) => lut[i * 4 + c]) as Rgb,
    );
    expect(await render(256, 1, s, ramp, want)).toBeLessThanOrEqual(1);
  });
});

// 1089 fixed colors through a 3D LUT: the per-point function is the reference.
const SIDE = 33;
const COLORS = Array.from({ length: SIDE * SIDE }, (_, i): Rgb => [
  (i * 37) % 256,
  (i * 91) % 256,
  (i * 173) % 256,
]);
const invertRgb = (_s: AdjustmentSettings, r: number, g: number, b: number): Rgb => [
  1 - r,
  1 - g,
  1 - b,
];

// Trilinear on 33³ is within 2/255 where the function is smooth in RGB (a pure hue rotation,
// a linear map); once saturation or lightness move, the HSL / luminance kinks need 8/255, the
// tolerance Compositor's own tests use.
describe.each([
  ["Invert", settings("Invert", {}), invertRgb, 2],
  ["Hue/Saturation", settings("Hue/Saturation", { hue: 30 }), hueSaturationRgb, 2],
  [
    "Hue/Saturation",
    settings("Hue/Saturation", { hue: 30, saturation: -20, lightness: 10 }),
    hueSaturationRgb,
    8,
  ],
  [
    "Gradient Map",
    settings("Gradient Map", {
      gradientMapSettings: {
        shadows: { red: 0.1, green: 0.2, blue: 0.5 },
        highlights: { red: 1, green: 0.9, blue: 0.3 },
        reversed: false,
      },
    }),
    gradientMapRgb,
    8,
  ],
  [
    "Black & White",
    settings("Black & White", {
      blackWhiteSettings: {
        reds: 40,
        yellows: 60,
        greens: 40,
        cyans: 60,
        blues: 20,
        magentas: 80,
        tint: true,
        tintHue: 40,
        tintSaturation: 20,
      },
    }),
    blackWhiteRgb,
    8,
  ],
  [
    "Color Balance",
    settings("Color Balance", {
      colorBalanceSettings: {
        shadowCyanRed: 20,
        shadowMagentaGreen: -30,
        shadowYellowBlue: 40,
        midCyanRed: 30,
        midMagentaGreen: -20,
        midYellowBlue: -40,
        highlightCyanRed: -10,
        highlightMagentaGreen: 25,
        highlightYellowBlue: 0,
        preserveLuminosity: true,
      },
    }),
    colorBalanceRgb,
    8,
  ],
] as const)("%s %#", (_kind, s, fn, tolerance) => {
  it(`matches the per-point function within ${tolerance}/255`, async () => {
    const pixels = new Uint8Array(SIDE * SIDE * 4);
    COLORS.forEach((c, i) => pixels.set([...c, 255], i * 4));
    const want = COLORS.map(([r, g, b]) => fn(s, r / 255, g / 255, b / 255));
    expect(await render(SIDE, SIDE, s, pixels, want)).toBeLessThanOrEqual(tolerance);
  });
});

/** Renders `pixels` under one adjustment layer; the largest difference from `want` in 0–255. */
async function render(
  width: number,
  height: number,
  s: AdjustmentSettings,
  pixels: Uint8Array,
  want: readonly Rgb[],
): Promise<number> {
  const doc = makeDoc({ width, height, layers: [{}, { adjustment: s }] });
  const m = await mountCanvas(doc);
  mounted.push(m.unmount);
  const rect = { x: 0, y: 0, width, height };
  m.api.writeRegion(doc.manifest.layers[0].id, "image", rect, pixels);
  m.api.requestRender();
  const got = m.api.readComposite(rect);
  let worst = 0;
  want.forEach((rgb, i) => {
    for (let c = 0; c < 3; c++) {
      const expected = Math.min(1, Math.max(0, rgb[c])) * 255;
      worst = Math.max(worst, Math.abs((got[i * 4 + c] ?? 0) - expected));
    }
    expect(got[i * 4 + 3]).toBe(255);
  });
  return worst;
}

describe("cachedLut", () => {
  it("builds a key once and evicts the least recently used past 32", () => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("no webgl2");
    const data = new Float32Array(256 * 4);
    const build = vi.fn<() => Float32Array>(() => data);
    const first = cachedLut(gl, "key-0", 1, build);
    const again = cachedLut(gl, "key-0", 1, build);
    expect(build).toHaveBeenCalledTimes(1);
    // Every call is a texture of its own: 10 deletes what `lut` returns.
    expect(again.texture).not.toBe(first.texture);
    for (let i = 1; i <= 32; i++) cachedLut(gl, `key-${i}`, 1, build);
    expect(build).toHaveBeenCalledTimes(33);
    cachedLut(gl, "key-32", 1, build);
    expect(build).toHaveBeenCalledTimes(33);
    cachedLut(gl, "key-0", 1, build);
    expect(build).toHaveBeenCalledTimes(34);
  });

  it("leaves the caller's texture bindings as they were", () => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) throw new Error("no webgl2");
    const t2 = gl.createTexture();
    const t3 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t2);
    gl.bindTexture(gl.TEXTURE_3D, t3);
    const lut = cachedLut(gl, "bindings", 3, () => new Float32Array(LUT3D_SIZE ** 3 * 4));
    cachedLut(gl, "bindings", 1, () => new Float32Array(256 * 4));
    expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).toBe(t2);
    expect(gl.getParameter(gl.TEXTURE_BINDING_3D)).toBe(t3);
    expect(gl.isTexture(lut.texture)).toBe(true);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });
});
