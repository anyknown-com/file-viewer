// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerEffects.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
// What a new effect starts with, and the ranges each struct's `isValid` accepts.
import type { LayerEffects } from "../../comp/index";

export const EFFECT_NAMES = [
  "stroke",
  "shadow",
  "colorOverlay",
  "innerShadow",
  "outerGlow",
  "innerGlow",
] as const;
export type EffectName = (typeof EFFECT_NAMES)[number];
type Effect<N extends EffectName> = NonNullable<LayerEffects[N]>;

const DEFAULTS: { [N in EffectName]: Effect<N> } = {
  stroke: { enabled: true, size: 4, red: 0, green: 0, blue: 0, opacity: 1, inside: false },
  shadow: {
    enabled: true,
    angle: 90,
    distance: 20,
    blur: 20,
    red: 0,
    green: 0,
    blue: 0,
    opacity: 0.5,
  },
  colorOverlay: { enabled: true, red: 0, green: 0, blue: 0, opacity: 1 },
  innerShadow: {
    enabled: true,
    angle: 90,
    distance: 10,
    blur: 10,
    red: 0,
    green: 0,
    blue: 0,
    opacity: 0.5,
  },
  outerGlow: { enabled: true, size: 20, red: 1, green: 1, blue: 1, opacity: 0.75 },
  innerGlow: { enabled: true, size: 10, red: 1, green: 1, blue: 1, opacity: 0.75 },
};

/** A new effect as Compositor's struct initializer makes it, switched on. */
export function defaultEffect<N extends EffectName>(name: N): Effect<N> {
  return { ...DEFAULTS[name] };
}

type Range = { readonly min: number; readonly max: number };
const UNIT: Range = { min: 0, max: 1 };
const COLOR = { red: UNIT, green: UNIT, blue: UNIT, opacity: UNIT };
const SHADOW = {
  angle: { min: -360, max: 360 },
  distance: { min: 0, max: 5000 },
  blur: { min: 0, max: 500 },
  ...COLOR,
};

/** Every numeric field's range, as each effect's `isValid` checks it. */
export const EFFECT_RANGES = {
  stroke: { size: { min: 0, max: 500 }, ...COLOR },
  shadow: SHADOW,
  colorOverlay: COLOR,
  innerShadow: SHADOW,
  outerGlow: { size: { min: 0, max: 500 }, ...COLOR },
  innerGlow: { size: { min: 0, max: 500 }, ...COLOR },
} as const satisfies { [N in EffectName]: Partial<Record<keyof Effect<N>, Range>> };
