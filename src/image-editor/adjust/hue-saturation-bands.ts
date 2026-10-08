// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/HueSaturation.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// Also Compositor/Document/LayerAdjustment.swift (`resolvedHSV`). `hsvSettings.adjustments` and
// `.bands` are Swift `[ColorRange: V]` dictionaries, which encode as one array alternating key and
// value; 09 keeps them as is and they are read here.
import type { AdjustmentSettings } from "../api";

export type ColorRange = "Master" | "Reds" | "Yellows" | "Greens" | "Cyans" | "Blues" | "Magentas";
export type RangeAdjustment = { hue: number; saturation: number; lightness: number };
type HueBand = { falloffStart: number; rangeStart: number; rangeEnd: number; falloffEnd: number };

/** `ColorRange.allCases`; every sum over ranges runs in this order, whatever order the file has. */
export const COLOR_RANGES: readonly ColorRange[] = [
  "Master",
  "Reds",
  "Yellows",
  "Greens",
  "Cyans",
  "Blues",
  "Magentas",
];

const band = (falloffStart: number, rangeStart: number, rangeEnd: number, falloffEnd: number) => ({
  falloffStart,
  rangeStart,
  rangeEnd,
  falloffEnd,
});

// `ColorRange.defaultBand`.
const DEFAULT_BANDS: Record<ColorRange, HueBand> = {
  Master: band(0, 0, 360, 360),
  Reds: band(315, 345, 15, 45),
  Yellows: band(15, 45, 75, 105),
  Greens: band(75, 105, 135, 165),
  Cyans: band(135, 165, 195, 225),
  Blues: band(195, 225, 255, 285),
  Magentas: band(255, 285, 315, 345),
};

const isRange = (key: unknown): key is ColorRange =>
  typeof key === "string" && (COLOR_RANGES as readonly string[]).includes(key);

const num = (v: unknown) => (typeof v === "number" ? v : 0);

// A decoded `[ColorRange: V]`; a repeated key keeps the last value, as Swift's decoder does.
function interleaved<V>(items: readonly unknown[], read: (o: Record<string, unknown>) => V) {
  const map = new Map<ColorRange, V>();
  for (let i = 0; i + 1 < items.length; i += 2) {
    const key = items[i];
    const value = items[i + 1];
    if (isRange(key) && typeof value === "object" && value !== null) {
      map.set(key, read(value as Record<string, unknown>));
    }
  }
  return map;
}

/** `LayerAdjustment.resolvedHSV`: `hsvSettings`, or the legacy top-level fields on Master. */
export function resolveHsv(s: AdjustmentSettings) {
  const hsv = s.hsvSettings;
  if (!hsv) {
    const master = { hue: s.hue, saturation: s.saturation, lightness: s.lightness };
    return {
      range: "Master" as ColorRange,
      colorize: s.colorize,
      invertRange: false,
      adjustments: new Map<ColorRange, RangeAdjustment>([["Master", master]]),
      bands: new Map<ColorRange, HueBand>(),
    };
  }
  return {
    range: hsv.range as ColorRange,
    colorize: hsv.colorize,
    invertRange: hsv.invertRange,
    adjustments: interleaved(hsv.adjustments, (o) => ({
      hue: num(o.hue),
      saturation: num(o.saturation),
      lightness: num(o.lightness),
    })),
    bands: interleaved(hsv.bands, (o) =>
      band(num(o.falloffStart), num(o.rangeStart), num(o.rangeEnd), num(o.falloffEnd)),
    ),
  };
}

export type ResolvedHsv = ReturnType<typeof resolveHsv>;

/** Each color range's hue / saturation / lightness, read from the interleaved `adjustments`. */
export function readBands(s: AdjustmentSettings): Map<string, RangeAdjustment> {
  return resolveHsv(s).adjustments;
}

// `HueBand.forward`: degrees from `from` forward to `to`, 0…360.
function forward(from: number, to: number): number {
  const delta = (to - from) % 360;
  return delta < 0 ? delta + 360 : delta;
}

// `HueBand.weight(of:)`.
function hueBandWeight(b: HueBand, hue: number): number {
  const span = forward(b.falloffStart, b.falloffEnd);
  if (!(span > 0)) return 1;
  const position = forward(b.falloffStart, hue);
  if (position > span) return 0;
  const rampIn = forward(b.falloffStart, b.rangeStart);
  const plateauEnd = forward(b.falloffStart, b.rangeEnd);
  if (position < rampIn) return rampIn > 0 ? position / rampIn : 1;
  if (position <= plateauEnd) return 1;
  const rampOut = span - plateauEnd;
  return rampOut > 0 ? (span - position) / rampOut : 1;
}

// `HueSaturationSettings.weight(of:hue:)` on already resolved settings.
export function resolvedWeight(hsv: ResolvedHsv, range: ColorRange, hue: number): number {
  if (range === "Master") return 1;
  const weight = hueBandWeight(hsv.bands.get(range) ?? DEFAULT_BANDS[range], hue);
  return hsv.invertRange && range === hsv.range ? 1 - weight : weight;
}

/** How much `range` applies to `hue` (degrees): Master everywhere, others through their band. */
export function bandWeight(range: string, hue: number, s: AdjustmentSettings): number {
  return isRange(range) ? resolvedWeight(resolveHsv(s), range, hue) : 0;
}
