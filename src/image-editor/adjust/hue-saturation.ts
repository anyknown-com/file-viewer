// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/HueSaturation.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// `HueSaturationFilter`: every cube point goes to HSL, is adjusted, and comes back. Colors are straight
// sRGB, 0–1.
import type { AdjustmentSettings } from "../api";
import { COLOR_RANGES, type ResolvedHsv, resolveHsv, resolvedWeight } from "./hue-saturation-bands";
import { buildLut3d } from "./lut3d";

type Rgb = [number, number, number];
type Response = { shift: number; saturation: number; lightness: number };

// `HueSaturationFilter.hueResponse`: what every range adds up to at each whole degree 0…360.
function hueResponse(hsv: ResolvedHsv): Response[] {
  const table: Response[] = [];
  for (let degree = 0; degree <= 360; degree++) {
    const response = { shift: 0, saturation: 0, lightness: 0 };
    for (const range of COLOR_RANGES) {
      const a = hsv.adjustments.get(range);
      if (!a || (a.hue === 0 && a.saturation === 0 && a.lightness === 0)) continue;
      const weight = resolvedWeight(hsv, range, degree);
      if (!(weight > 0)) continue;
      response.shift += a.hue * weight;
      response.saturation += a.saturation * weight;
      response.lightness += a.lightness * weight;
    }
    table.push(response);
  }
  return table;
}

/**
 * `HueSaturationFilter.adjustedSaturation`: below 0 it scales toward gray; above 0 it divides by
 * what is left, so +50 doubles it and +100 takes any color all the way.
 */
export function adjustedSaturation(saturation: number, by: number): number {
  const amount = Math.min(1, Math.max(-1, by / 100));
  if (!(amount > 0)) return Math.max(0, saturation * (1 + amount));
  return amount >= 1 ? (saturation > 0 ? 1 : 0) : Math.min(1, saturation / (1 - amount));
}

// `HueSaturationFilter.toHSL`.
function toHsl(r: number, g: number, b: number): Rgb {
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const lightness = (high + low) / 2;
  const delta = high - low;
  if (!(delta > 0)) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (high === r) hue = (g - b) / delta;
  else if (high === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, Math.min(1, saturation), lightness];
}

const unit = (v: number) => Math.min(1, Math.max(0, v));

// `HueSaturationFilter.toRGB`.
function toRgb(hue: number, saturation: number, lightness: number): Rgb {
  if (!(saturation > 0)) return [lightness, lightness, lightness];
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = lightness - chroma / 2;
  let rgb: Rgb;
  switch (Math.trunc(sector)) {
    case 0:
      rgb = [chroma, second, 0];
      break;
    case 1:
      rgb = [second, chroma, 0];
      break;
    case 2:
      rgb = [0, chroma, second];
      break;
    case 3:
      rgb = [0, second, chroma];
      break;
    case 4:
      rgb = [second, 0, chroma];
      break;
    default:
      rgb = [chroma, 0, second];
  }
  return [unit(rgb[0] + base), unit(rgb[1] + base), unit(rgb[2] + base)];
}

// `HueSaturationFilter.adjust`.
function adjust(hsv: ResolvedHsv, response: Response[], r: number, g: number, b: number): Rgb {
  let [hue, saturation, lightness] = toHsl(r, g, b);
  let lightnessAmount: number;
  if (hsv.colorize) {
    // The sliders show the selected range's values.
    const selected = hsv.adjustments.get(hsv.range);
    hue = (selected?.hue ?? 0) % 360;
    saturation = unit((selected?.saturation ?? 0) / 100);
    lightnessAmount = (selected?.lightness ?? 0) / 100;
  } else {
    const index = Math.min(response.length - 1, Math.max(0, Math.round(hue)));
    const sampled = response[index] ?? { shift: 0, saturation: 0, lightness: 0 };
    lightnessAmount = sampled.lightness / 100;
    hue = (hue + sampled.shift) % 360;
    if (hue < 0) hue += 360;
    saturation = adjustedSaturation(saturation, sampled.saturation);
  }
  // Lightness pulls toward white above 0 and toward black below, reaching either at ±100.
  const amount = Math.min(1, Math.max(-1, lightnessAmount));
  lightness = amount >= 0 ? lightness + (1 - lightness) * amount : lightness * (1 + amount);
  return toRgb(hue, saturation, unit(lightness));
}

/** One straight sRGB color (0–1) through the Hue/Saturation settings. */
export function hueSaturationRgb(s: AdjustmentSettings, r: number, g: number, b: number): Rgb {
  const hsv = resolveHsv(s);
  return adjust(hsv, hueResponse(hsv), r, g, b);
}

/** `HueSaturationFilter.buildCube`: the settings baked into a 33³ cube. */
export function hueSaturationLut(s: AdjustmentSettings): Float32Array {
  const hsv = resolveHsv(s);
  const response = hueResponse(hsv);
  return buildLut3d((r, g, b) => adjust(hsv, response, r, g, b));
}
