// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/AdjustPixels.c), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// `adjust_gradient_map`, `adjust_black_white` and `adjust_color_balance` on one straight sRGB color
// (0–1), with the settings turned into the kernels' arguments as Compositor/Document/
// ImageAdjustments.swift does. Unset settings resolve to the Swift structs' defaults.
import type { AdjustmentSettings } from "../api";
import { buildLut3d } from "./lut3d";

type Rgb = [number, number, number];

const unit = (v: number) => Math.min(1, Math.max(0, v));

// `GradientMapSettings()`.
const GRADIENT_MAP = {
  shadows: { red: 0, green: 0, blue: 0 },
  highlights: { red: 1, green: 1, blue: 1 },
  reversed: false,
};

/**
 * Gradient Map: the Rec. 709 luminance, rounded to a byte, picks a color from the 256-entry byte
 * table `GradientMapSettings.apply` builds between the dark and light ends.
 */
export function gradientMapRgb(s: AdjustmentSettings, r: number, g: number, b: number): Rgb {
  const { shadows, highlights, reversed } = s.gradientMapSettings ?? GRADIENT_MAP;
  const [dark, light] = reversed ? [highlights, shadows] : [shadows, highlights];
  const level = Math.min(
    255,
    Math.floor((2126 * r * 255 + 7152 * g * 255 + 722 * b * 255 + 5000) / 10000),
  );
  const t = level / 255;
  const channel = (from: number, to: number) =>
    Math.min(255, Math.max(0, Math.round((from + (to - from) * t) * 255))) / 255;
  return [
    channel(dark.red, light.red),
    channel(dark.green, light.green),
    channel(dark.blue, light.blue),
  ];
}

// `BlackWhiteSettings()`: Photoshop's defaults.
const BLACK_WHITE = {
  reds: 40,
  yellows: 60,
  greens: 40,
  cyans: 60,
  blues: 20,
  magentas: 80,
  tint: false,
  tintHue: 40,
  tintSaturation: 20,
};

/**
 * Black & White: gray = min + (mid − min) × secondary weight + (max − mid) × primary weight; with a
 * tint, that gray becomes the lightness of a color at the tint hue.
 */
export function blackWhiteRgb(s: AdjustmentSettings, r: number, g: number, b: number): Rgb {
  const bw = s.blackWhiteSettings ?? BLACK_WHITE;
  // Red, yellow, green, cyan, blue, magenta.
  const weights = [bw.reds, bw.yellows, bw.greens, bw.cyans, bw.blues, bw.magentas].map(
    (w) => w / 100,
  );
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const md = r + g + b - mx - mn;
  let primary: number;
  let secondary: number;
  if (mx === r) [primary, secondary] = [0, g >= b ? 1 : 5];
  else if (mx === g) [primary, secondary] = [2, r >= b ? 1 : 3];
  else [primary, secondary] = [4, g >= r ? 3 : 5];
  const gray = unit(
    mn + (md - mn) * (weights[secondary] ?? 0) + (mx - md) * (weights[primary] ?? 0),
  );
  const saturation = bw.tintSaturation / 100;
  return bw.tint && saturation > 0 ? tinted(gray, bw.tintHue, saturation) : [gray, gray, gray];
}

// The gray becomes the lightness of a color at the tint hue.
function tinted(gray: number, tintHue: number, saturation: number): Rgb {
  const c = (1 - Math.abs(2 * gray - 1)) * saturation;
  const hp = (tintHue % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: Rgb;
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = gray - c / 2;
  return [unit(rgb[0] + m), unit(rgb[1] + m), unit(rgb[2] + m)];
}

// `tonal_weights`: three overlapping ramps for shadows, midtones and highlights.
function tonalWeights(v: number): Rgb {
  const a = 0.25;
  const b = 0.333;
  const scale = 0.7;
  const s = unit((v - b) / -a + 0.5);
  const h = unit((v + b - 1) / a + 0.5);
  const m1 = unit((v - b) / a + 0.5);
  const m2 = unit((v + b - 1) / -a + 0.5);
  return [s * scale, m1 * m2 * scale, h * scale];
}

/**
 * Color Balance: each channel shifts by how much it belongs to each tonal range; Preserve Luminosity
 * scales the result back to the original Rec. 601 brightness.
 */
export function colorBalanceRgb(s: AdjustmentSettings, r: number, g: number, b: number): Rgb {
  const cb = s.colorBalanceSettings;
  if (!cb) return [r, g, b];
  const shadows = [cb.shadowCyanRed, cb.shadowMagentaGreen, cb.shadowYellowBlue];
  const midtones = [cb.midCyanRed, cb.midMagentaGreen, cb.midYellowBlue];
  const highlights = [cb.highlightCyanRed, cb.highlightMagentaGreen, cb.highlightYellowBlue];
  // `ColorBalanceSettings.isIdentity` leaves the image as it is.
  if ([...shadows, ...midtones, ...highlights].every((v) => v === 0)) return [r, g, b];
  const c: Rgb = [r, g, b];
  const before = 0.299 * r + 0.587 * g + 0.114 * b;
  for (let i = 0; i < 3; i++) {
    const [ws, wm, wh] = tonalWeights(c[i]);
    const shift =
      ((shadows[i] ?? 0) * ws + (midtones[i] ?? 0) * wm + (highlights[i] ?? 0) * wh) / 100;
    c[i] = unit(c[i] + shift);
  }
  if (cb.preserveLuminosity) {
    const after = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    if (after > 0.0001) {
      const ratio = before / after;
      for (let i = 0; i < 3; i++) c[i] = unit(c[i] * ratio);
    }
  }
  return c;
}

export function gradientMapLut(s: AdjustmentSettings): Float32Array {
  return buildLut3d((r, g, b) => gradientMapRgb(s, r, g, b));
}

export function blackWhiteLut(s: AdjustmentSettings): Float32Array {
  return buildLut3d((r, g, b) => blackWhiteRgb(s, r, g, b));
}

export function colorBalanceLut(s: AdjustmentSettings): Float32Array {
  return buildLut3d((r, g, b) => colorBalanceRgb(s, r, g, b));
}

/** Invert: 1 − x on each channel. */
export function invertLut(_s: AdjustmentSettings): Float32Array {
  return buildLut3d((r, g, b) => [1 - r, 1 - g, 1 - b]);
}
