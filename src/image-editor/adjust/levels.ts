// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/Levels.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// Also Compositor/Document/LevelsAutomatic.swift (`LevelsAuto.contrast`).
import type { AdjustmentSettings } from "../api";

type LevelRange = AdjustmentSettings["levels"]["ranges"][number];

const IDENTITY: LevelRange = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

// `LevelRange.normalized`.
function normalized(r: LevelRange): LevelRange {
  const black = clamp(r.black, 0, 254, 0);
  return {
    black,
    white: clamp(r.white, black + 1, 255, 255),
    gamma: clamp(r.gamma, 0.1, 9.99, 1),
    outputBlack: clamp(r.outputBlack, 0, 255, 0),
    outputWhite: clamp(r.outputWhite, 0, 255, 255),
  };
}

// `LevelRange.apply`: value and result 0–1.
function applyRange(range: LevelRange, value: number): number {
  const s = normalized(range);
  const input = Math.min(1, Math.max(0, (value * 255 - s.black) / (s.white - s.black)));
  return (s.outputBlack + Math.pow(input, 1 / s.gamma) * (s.outputWhite - s.outputBlack)) / 255;
}

/** 256 RGBA entries: entry i holds each channel's output (0–1) for input i/255; A is 1. */
export function levelsLut(s: AdjustmentSettings): Float32Array {
  const ranges = s.levels.ranges;
  const master = ranges[0] ?? IDENTITY;
  const lut = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    for (let c = 0; c < 3; c++) {
      // `LevelsSettings.apply`: the channel's own range first, then the composite RGB range.
      lut[i * 4 + c] = applyRange(master, applyRange(ranges[c + 1] ?? IDENTITY, i / 255));
    }
    lut[i * 4 + 3] = 1;
  }
  return lut;
}

export type Histogram = { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array };

/** Counts of straight RGBA8 pixels per value; fully transparent pixels are left out. */
export function histogram(rgba: Uint8Array): Histogram {
  const h: Histogram = {
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
    luma: new Uint32Array(256),
  };
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    h.r[r]++;
    h.g[g]++;
    h.b[b]++;
    h.luma[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
  }
  return h;
}

// `endpoints`: the first and last values past 0.1% of the pixels from each end.
function endpoints(bins: Uint32Array): [number, number] | null {
  const total = bins.reduce((a, n) => a + n, 0);
  if (total <= 0) return null;
  let sum = 0;
  let low = 0;
  let high = 255;
  for (let i = 0; i < 256; i++) {
    sum += bins[i] ?? 0;
    if (sum > total * 0.001) {
      low = i;
      break;
    }
  }
  sum = 0;
  for (let i = 255; i >= 0; i--) {
    sum += bins[i] ?? 0;
    if (sum > total * 0.001) {
      high = i;
      break;
    }
  }
  return low < high ? [low, high] : null;
}

/**
 * Compositor's "Contrast" auto levels: one shared input interval on the RGB range, from the darkest
 * to the lightest channel endpoint, so channel relationships are kept. Only `levels` changes.
 */
export function autoLevels(h: Histogram, current: AdjustmentSettings): AdjustmentSettings {
  const ranges = [IDENTITY, IDENTITY, IDENTITY, IDENTITY].map((r) => ({ ...r }));
  const limits = [h.r, h.g, h.b].map(endpoints).filter((l) => l !== null);
  if (limits.length > 0) {
    const low = Math.min(...limits.map((l) => l[0]));
    const high = Math.max(...limits.map((l) => l[1]));
    if (low < high) ranges[0] = { ...IDENTITY, black: low, white: high };
  }
  return { ...current, levels: { channel: "RGB", ranges } };
}
