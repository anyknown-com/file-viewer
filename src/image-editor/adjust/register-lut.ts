// The 8 per-pixel adjustments as LUT textures; 10's composite shader does the lookup.
import type { AdjustmentKind, AdjustmentSettings } from "../api";
import { registerAdjustment } from "../registry";
import { blackWhiteLut, colorBalanceLut, gradientMapLut, invertLut } from "./color-lut";
import { curvesLut } from "./curves";
import { exposureLut } from "./exposure";
import { hueSaturationLut } from "./hue-saturation";
import { levelsLut } from "./levels";
import { cachedLut } from "./lut-texture";
import { KIND_KEY, type KindKey } from "./settings";

type Build = (s: AdjustmentSettings) => Float32Array;

const LUTS: Partial<Record<KindKey, { dims: 1 | 3; build: Build }>> = {
  levels: { dims: 1, build: levelsLut },
  curves: { dims: 1, build: curvesLut },
  exposure: { dims: 1, build: exposureLut },
  hueSaturation: { dims: 3, build: hueSaturationLut },
  gradientMap: { dims: 3, build: gradientMapLut },
  blackWhite: { dims: 3, build: blackWhiteLut },
  colorBalance: { dims: 3, build: colorBalanceLut },
  invert: { dims: 3, build: invertLut },
};

export function registerLutAdjustments(): void {
  for (const [kind, key] of Object.entries(KIND_KEY) as [AdjustmentKind, KindKey][]) {
    const lut = LUTS[key];
    if (!lut) continue;
    registerAdjustment(kind, {
      lut: (gl, s) => cachedLut(gl, JSON.stringify(s), lut.dims, () => lut.build(s)),
      reach: () => 0,
    });
  }
}
