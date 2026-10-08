// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerAdjustment.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// Defaults are what `LayerAdjustment(kind:)` encodes in `EditorSession.addAdjustment`: the optional
// per-kind settings stay unset (Compositor resolves them to defaults on read), except Gradient Map,
// Grain and Add Noise, which a new layer writes out.
import type { AdjustmentKind, AdjustmentSettings } from "../api";

export type KindKey =
  | "levels"
  | "curves"
  | "exposure"
  | "hueSaturation"
  | "gradientMap"
  | "blackWhite"
  | "colorBalance"
  | "invert"
  | "grain"
  | "addNoise"
  | "gaussianBlur"
  | "motionBlur";

export const KIND_KEY: Record<AdjustmentKind, KindKey> = {
  "Hue/Saturation": "hueSaturation",
  Levels: "levels",
  Curves: "curves",
  Exposure: "exposure",
  "Gradient Map": "gradientMap",
  Grain: "grain",
  "Add Noise": "addNoise",
  "Gaussian Blur": "gaussianBlur",
  "Motion Blur": "motionBlur",
  Invert: "invert",
  "Black & White": "blackWhite",
  "Color Balance": "colorBalance",
};

// LayerAdjustment.swift `AdjustmentKind` case order.
export const ADJUSTMENT_KINDS: readonly AdjustmentKind[] = [
  "Hue/Saturation",
  "Levels",
  "Curves",
  "Exposure",
  "Gradient Map",
  "Grain",
  "Add Noise",
  "Gaussian Blur",
  "Motion Blur",
  "Invert",
  "Black & White",
  "Color Balance",
];

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

// Levels.swift `LevelRange()`.
const levelRange = () => ({ black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 });
// Curves.swift `CurvesSettings()`.
const diagonal = () => [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

export function defaultAdjustment(
  kind: AdjustmentKind,
  seed: number = randomSeed(),
): AdjustmentSettings {
  const s: AdjustmentSettings = {
    kind,
    hue: 0,
    saturation: 0,
    lightness: 0,
    colorize: false,
    levels: { channel: "RGB", ranges: [levelRange(), levelRange(), levelRange(), levelRange()] },
    curves: { channel: "RGB", channels: [diagonal(), diagonal(), diagonal(), diagonal()] },
  };
  // Compositor starts a Gradient Map at the foreground → background colors; ours are black → white.
  if (kind === "Gradient Map") {
    s.gradientMapSettings = {
      shadows: { red: 0, green: 0, blue: 0 },
      highlights: { red: 1, green: 1, blue: 1 },
      reversed: false,
    };
  }
  if (kind === "Grain") s.grainSettings = { amount: 25, size: 1.5, roughness: 50, seed };
  if (kind === "Add Noise") s.noiseSeed = seed;
  return s;
}
