// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/ImageAdjustments.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// Swift's synthesized Codable makes every non-optional stored property a required key, even when it
// has a default value; none of these structs has an optional field. Value ranges are checked later
// by validateLikeCompositor (each struct's `isValid`), not here.
import { z } from "zod";
import { record } from "./extra";

// Swift UInt32 (GrainSettings.seed, LayerAdjustment.noiseSeed).
export const uint32Schema = z.number().int().min(0).max(0xffffffff);

// AdjustmentColor: a straight sRGB color, 0–1 per channel.
export const adjustmentColorSchema = record({
  red: z.number(),
  green: z.number(),
  blue: z.number(),
});

// ExposureSettings
export const exposureSettingsSchema = record({
  exposure: z.number(),
  offset: z.number(),
  gamma: z.number(),
});

// GradientMapSettings
export const gradientMapSettingsSchema = record({
  shadows: adjustmentColorSchema,
  highlights: adjustmentColorSchema,
  reversed: z.boolean(),
});

// BlackWhiteSettings
export const blackWhiteSettingsSchema = record({
  reds: z.number(),
  yellows: z.number(),
  greens: z.number(),
  cyans: z.number(),
  blues: z.number(),
  magentas: z.number(),
  tint: z.boolean(),
  tintHue: z.number(),
  tintSaturation: z.number(),
});

// ColorBalanceSettings
export const colorBalanceSettingsSchema = record({
  shadowCyanRed: z.number(),
  shadowMagentaGreen: z.number(),
  shadowYellowBlue: z.number(),
  midCyanRed: z.number(),
  midMagentaGreen: z.number(),
  midYellowBlue: z.number(),
  highlightCyanRed: z.number(),
  highlightMagentaGreen: z.number(),
  highlightYellowBlue: z.number(),
  preserveLuminosity: z.boolean(),
});

// GrainSettings
export const grainSettingsSchema = record({
  amount: z.number(),
  size: z.number(),
  roughness: z.number(),
  seed: uint32Schema,
});
