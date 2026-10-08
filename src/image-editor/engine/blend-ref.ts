// CPU reference for the 24 blend modes, the same formulas as blend.glsl.ts; tests compare the GPU to it.
// Sources: W3C Compositing and Blending Level 1 (§9.1 source-over with blending, §10 the 15 modes it
// defines, SetLum / SetSat for the 4 non-separable ones); Soft Light is Photoshop's; Linear Burn, Linear
// Dodge (Add), Vivid Light, Linear Light, Pin Light, Hard Mix, Subtract and Divide are Photoshop's
// commonly published formulas.
import { BLEND_MODES, type BlendMode } from "../api";

type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// W3C color-dodge / color-burn, with their edge cases.
function dodge(b: number, s: number): number {
  if (b === 0) return 0;
  if (s >= 1) return 1;
  return Math.min(1, b / (1 - s));
}
function burn(b: number, s: number): number {
  if (b >= 1) return 1;
  if (s <= 0) return 0;
  return 1 - Math.min(1, (1 - b) / s);
}
function hardLight(b: number, s: number): number {
  return s <= 0.5 ? b * 2 * s : b + (2 * s - 1) - b * (2 * s - 1);
}

const separable: ((b: number, s: number) => number)[] = [
  (_b, s) => s, // Normal
  (b, s) => Math.min(b, s), // Darken (W3C)
  (b, s) => b * s, // Multiply (W3C)
  burn, // Color Burn (W3C)
  (b, s) => Math.max(0, b + s - 1), // Linear Burn (Photoshop)
  (b, s) => Math.max(b, s), // Lighten (W3C)
  (b, s) => b + s - b * s, // Screen (W3C)
  dodge, // Color Dodge (W3C)
  (b, s) => Math.min(1, b + s), // Linear Dodge (Add) (Photoshop)
  (b, s) => hardLight(s, b), // Overlay (W3C: hard-light with the layers swapped)
  // Soft Light (Photoshop): a = backdrop, b = source.
  (b, s) =>
    s <= 0.5 ? 2 * b * s + b * b * (1 - 2 * s) : 2 * b * (1 - s) + Math.sqrt(b) * (2 * s - 1),
  hardLight, // Hard Light (W3C)
  (b, s) => (s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * s - 1)), // Vivid Light (Photoshop)
  (b, s) => clamp01(b + 2 * s - 1), // Linear Light (Photoshop)
  (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)), // Pin Light (Photoshop)
  (b, s) => (b + s >= 1 ? 1 : 0), // Hard Mix (Photoshop)
  (b, s) => Math.abs(b - s), // Difference (W3C)
  (b, s) => b + s - 2 * b * s, // Exclusion (W3C)
  (b, s) => Math.max(0, b - s), // Subtract (Photoshop)
  (b, s) => (s <= 0 ? (b <= 0 ? 0 : 1) : Math.min(1, b / s)), // Divide (Photoshop)
];

// W3C §10.2 non-separable helpers.
const lum = (c: RGB): number => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
function clipColor(c: RGB): RGB {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let out = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as RGB;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as RGB;
  return out;
}
function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}
const sat = (c: RGB): number => Math.max(...c) - Math.min(...c);
function setSat(c: RGB, s: number): RGB {
  const n = Math.min(...c);
  const x = Math.max(...c);
  if (x <= n) return [0, 0, 0];
  return c.map((v) => ((v - n) * s) / (x - n)) as RGB;
}

/** B(cb, cs) for `mode`, on straight 0–1 colors. */
export function blendRef(mode: BlendMode, cb: RGB, cs: RGB): RGB {
  switch (mode) {
    case "Hue":
      return setLum(setSat(cs, sat(cb)), lum(cb));
    case "Saturation":
      return setLum(setSat(cb, sat(cs)), lum(cb));
    case "Color":
      return setLum(cs, lum(cb));
    case "Luminosity":
      return setLum(cb, lum(cs));
    default: {
      const f = separable[BLEND_MODES.indexOf(mode)];
      return [f(cb[0], cs[0]), f(cb[1], cs[1]), f(cb[2], cs[2])];
    }
  }
}

/** W3C source-over with blending; straight 0–1 RGBA in and out. */
export function compositeRef(backdrop: RGBA, source: RGBA, mode: BlendMode): RGBA {
  const ab = backdrop[3];
  const as = source[3];
  const cb: RGB = [backdrop[0], backdrop[1], backdrop[2]];
  const cs: RGB = [source[0], source[1], source[2]];
  const mixed = blendRef(mode, cb, cs);
  const ao = as + ab * (1 - as);
  if (ao <= 0) return [0, 0, 0, 0];
  const c = [0, 1, 2].map((i) => {
    const csi = (1 - ab) * cs[i] + ab * mixed[i];
    return (as * csi + ab * cb[i] * (1 - as)) / ao;
  });
  return [c[0], c[1], c[2], ao];
}
