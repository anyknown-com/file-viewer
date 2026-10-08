// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerEffects.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// Every non-optional stored property is a required key (synthesized Codable); `enabled` is `Bool?`
// (missing means visible, `isEnabled`). Compositor does not check effects when it reads a file
// (`ProjectStore.validate` does not call `LayerEffects.isValid`), so we clamp values back into each
// struct's `isValid` range instead of rejecting them.
import { z } from "zod";
import { optional, record } from "./extra";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ColorFields = { red: number; green: number; blue: number; opacity: number };

// The `opacity` and `[red, green, blue]` clauses every effect's `isValid` shares.
function clampColor<T extends ColorFields>(e: T): T {
  return {
    ...e,
    red: clamp(e.red, 0, 1),
    green: clamp(e.green, 0, 1),
    blue: clamp(e.blue, 0, 1),
    opacity: clamp(e.opacity, 0, 1),
  };
}

const colorShape = {
  enabled: optional(z.boolean()),
  red: z.number(),
  green: z.number(),
  blue: z.number(),
  opacity: z.number(),
};

// StrokeEffect.maxSize
const STROKE_MAX_SIZE = 500;

// StrokeEffect: size 0…maxSize.
export const strokeEffectSchema = record({
  ...colorShape,
  size: z.number(),
  inside: z.boolean(),
}).transform((e) => ({ ...clampColor(e), size: clamp(e.size, 0, STROKE_MAX_SIZE) }));

// ShadowEffect and InnerShadowEffect share fields and `isValid`: angle −360…360, distance 0…5000,
// blur 0…500.
const shadowShape = { ...colorShape, angle: z.number(), distance: z.number(), blur: z.number() };
function clampShadow<T extends ColorFields & { angle: number; distance: number; blur: number }>(
  e: T,
): T {
  return {
    ...clampColor(e),
    angle: clamp(e.angle, -360, 360),
    distance: clamp(e.distance, 0, 5000),
    blur: clamp(e.blur, 0, 500),
  };
}

// ShadowEffect
export const shadowEffectSchema = record(shadowShape).transform(clampShadow);

// InnerShadowEffect
export const innerShadowEffectSchema = record(shadowShape).transform(clampShadow);

// ColorOverlayEffect
export const colorOverlayEffectSchema = record(colorShape).transform(clampColor);

// OuterGlowEffect and InnerGlowEffect: size 0…500.
const glowShape = { ...colorShape, size: z.number() };
function clampGlow<T extends ColorFields & { size: number }>(e: T): T {
  return { ...clampColor(e), size: clamp(e.size, 0, 500) };
}

// OuterGlowEffect
export const outerGlowEffectSchema = record(glowShape).transform(clampGlow);

// InnerGlowEffect
export const innerGlowEffectSchema = record(glowShape).transform(clampGlow);

// LayerEffects: every effect is optional.
export const layerEffectsSchema = record({
  stroke: optional(strokeEffectSchema),
  shadow: optional(shadowEffectSchema),
  colorOverlay: optional(colorOverlayEffectSchema),
  innerShadow: optional(innerShadowEffectSchema),
  outerGlow: optional(outerGlowEffectSchema),
  innerGlow: optional(innerGlowEffectSchema),
});
export type LayerEffects = z.output<typeof layerEffectsSchema>;
