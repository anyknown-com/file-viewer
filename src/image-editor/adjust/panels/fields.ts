// Field ranges: Compositor/Document/ImageAdjustments.swift and LayerAdjustment.swift `isValid`.
import type { AdjustmentSettings } from "../../api";
import type { AdjustKey } from "../messages";
import { KIND_KEY, type KindKey } from "../settings";

export type FieldSpec =
  | { path: string; label: AdjustKey; type: "slider"; min: number; max: number; step: number }
  | { path: string; label: AdjustKey; type: "switch" }
  | { path: string; label: AdjustKey; type: "color" };

const slider = (path: string, label: AdjustKey, min: number, max: number, step: number) =>
  ({ path, label, type: "slider", min, max, step }) as const;
const toggle = (path: string, label: AdjustKey) => ({ path, label, type: "switch" }) as const;

const bw = (path: string, label: AdjustKey) =>
  slider(`blackWhiteSettings.${path}`, label, -200, 300, 1);
const cb = (path: string, label: AdjustKey) =>
  slider(`colorBalanceSettings.${path}`, label, -100, 100, 1);

export const FIELDS: Record<KindKey, readonly FieldSpec[]> = {
  levels: [],
  curves: [],
  hueSaturation: [],
  invert: [],
  exposure: [
    slider("exposureSettings.exposure", "image.adjust.exposure.exposure", -20, 20, 0.01),
    slider("exposureSettings.offset", "image.adjust.exposure.offset", -0.5, 0.5, 0.001),
    slider("exposureSettings.gamma", "image.adjust.exposure.gamma", 0.01, 9.99, 0.01),
  ],
  gradientMap: [
    {
      path: "gradientMapSettings.shadows",
      label: "image.adjust.gradientMap.shadows",
      type: "color",
    },
    {
      path: "gradientMapSettings.highlights",
      label: "image.adjust.gradientMap.highlights",
      type: "color",
    },
    toggle("gradientMapSettings.reversed", "image.adjust.gradientMap.reversed"),
  ],
  blackWhite: [
    bw("reds", "image.adjust.blackWhite.reds"),
    bw("yellows", "image.adjust.blackWhite.yellows"),
    bw("greens", "image.adjust.blackWhite.greens"),
    bw("cyans", "image.adjust.blackWhite.cyans"),
    bw("blues", "image.adjust.blackWhite.blues"),
    bw("magentas", "image.adjust.blackWhite.magentas"),
    toggle("blackWhiteSettings.tint", "image.adjust.blackWhite.tint"),
    slider("blackWhiteSettings.tintHue", "image.adjust.blackWhite.tintHue", 0, 360, 1),
    slider(
      "blackWhiteSettings.tintSaturation",
      "image.adjust.blackWhite.tintSaturation",
      0,
      100,
      1,
    ),
  ],
  colorBalance: [
    cb("shadowCyanRed", "image.adjust.colorBalance.shadowCyanRed"),
    cb("shadowMagentaGreen", "image.adjust.colorBalance.shadowMagentaGreen"),
    cb("shadowYellowBlue", "image.adjust.colorBalance.shadowYellowBlue"),
    cb("midCyanRed", "image.adjust.colorBalance.midCyanRed"),
    cb("midMagentaGreen", "image.adjust.colorBalance.midMagentaGreen"),
    cb("midYellowBlue", "image.adjust.colorBalance.midYellowBlue"),
    cb("highlightCyanRed", "image.adjust.colorBalance.highlightCyanRed"),
    cb("highlightMagentaGreen", "image.adjust.colorBalance.highlightMagentaGreen"),
    cb("highlightYellowBlue", "image.adjust.colorBalance.highlightYellowBlue"),
    toggle(
      "colorBalanceSettings.preserveLuminosity",
      "image.adjust.colorBalance.preserveLuminosity",
    ),
  ],
  grain: [
    slider("grainSettings.amount", "image.adjust.grain.amount", 0, 100, 1),
    slider("grainSettings.size", "image.adjust.grain.size", 0.5, 20, 0.1),
    slider("grainSettings.roughness", "image.adjust.grain.roughness", 0, 100, 1),
  ],
  addNoise: [
    slider("noiseAmount", "image.adjust.addNoise.amount", 0.1, 400, 0.1),
    toggle("noiseGaussian", "image.adjust.addNoise.gaussian"),
    toggle("noiseMonochromatic", "image.adjust.addNoise.monochromatic"),
  ],
  gaussianBlur: [slider("blurRadius", "image.adjust.gaussianBlur.radius", 0.1, 250, 0.1)],
  motionBlur: [
    slider("motionAngle", "image.adjust.motionBlur.angle", -90, 90, 1),
    slider("motionDistance", "image.adjust.motionBlur.distance", 1, 2000, 1),
  ],
};

// What the swift structs resolve to when a record leaves the optional settings out.
const DEFAULTS = {
  exposureSettings: { exposure: 0, offset: 0, gamma: 1 },
  blackWhiteSettings: {
    reds: 40,
    yellows: 60,
    greens: 40,
    cyans: 60,
    blues: 20,
    magentas: 80,
    tint: false,
    tintHue: 40,
    tintSaturation: 20,
  },
  colorBalanceSettings: {
    shadowCyanRed: 0,
    shadowMagentaGreen: 0,
    shadowYellowBlue: 0,
    midCyanRed: 0,
    midMagentaGreen: 0,
    midYellowBlue: 0,
    highlightCyanRed: 0,
    highlightMagentaGreen: 0,
    highlightYellowBlue: 0,
    preserveLuminosity: true,
  },
  gradientMapSettings: {
    shadows: { red: 0, green: 0, blue: 0 },
    highlights: { red: 1, green: 1, blue: 1 },
    reversed: false,
  },
  grainSettings: { amount: 25, size: 1.5, roughness: 50, seed: 0 },
  blurRadius: 10,
  motionAngle: 0,
  motionDistance: 10,
  noiseAmount: 10,
  noiseGaussian: false,
  noiseMonochromatic: false,
} as const;

/** `s` with the unset optional settings of its own kind filled in, so a field edit writes a complete struct. */
export function resolveAdjustment(s: AdjustmentSettings): AdjustmentSettings {
  const out: Record<string, unknown> = { ...s };
  for (const field of FIELDS[KIND_KEY[s.kind]]) {
    const key = field.path.split(".")[0] as keyof typeof DEFAULTS;
    out[key] ??= DEFAULTS[key];
  }
  return out as AdjustmentSettings;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const key of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** A copy of `obj` with the dotted `path` set to `value`; `obj` is not changed. */
export function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  if (head === undefined) return obj;
  const child = (obj as Record<string, unknown>)[head];
  const next = rest.length === 0 ? value : setPath((child ?? {}) as object, rest.join("."), value);
  return { ...obj, [head]: next };
}
