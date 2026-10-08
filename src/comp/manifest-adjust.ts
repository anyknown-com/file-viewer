// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerAdjustment.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// Also Compositor/Document/Levels.swift, Curves.swift and HueSaturation.swift. Swift's synthesized
// Codable makes every non-optional stored property a required key, even with a default value
// (`var hue: Double = 0`); only `T?` properties are optional. Value ranges are checked later by
// validateLikeCompositor (`LayerAdjustment.isValid`), not here.
import { z } from "zod";
import { record } from "./extra";
import {
  blackWhiteSettingsSchema,
  colorBalanceSettingsSchema,
  exposureSettingsSchema,
  gradientMapSettingsSchema,
  grainSettingsSchema,
  uint32Schema,
} from "./manifest-image-adjust";

// LayerAdjustment.swift `AdjustmentKind` raw values.
export const adjustmentKindSchema = z.enum([
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
]);
export type AdjustmentKind = z.output<typeof adjustmentKindSchema>;

// Levels.swift `LevelsChannel`.
const levelsChannelSchema = z.enum(["RGB", "Red", "Green", "Blue"]);

// Levels.swift `LevelRange`.
const levelRangeSchema = record({
  black: z.number(),
  gamma: z.number(),
  white: z.number(),
  outputBlack: z.number(),
  outputWhite: z.number(),
});

// Levels.swift `LevelsSettings`.
export const levelsSchema = record({
  channel: levelsChannelSchema,
  ranges: z.array(levelRangeSchema),
});

// Curves.swift `CurvePoint` and `CurvesSettings`.
const curvePointSchema = record({ x: z.number(), y: z.number() });
export const curvesSchema = record({
  channel: levelsChannelSchema,
  channels: z.array(z.array(curvePointSchema)),
});

// HueSaturation.swift `ColorRange`.
const colorRangeSchema = z.enum([
  "Master",
  "Reds",
  "Yellows",
  "Greens",
  "Cyans",
  "Blues",
  "Magentas",
]);

// `[ColorRange: V]`: ColorRange is not CodingKeyRepresentable, so Swift encodes the dictionary as an
// array alternating key and value. Kept as is; only its shape is checked.
const interleavedSchema = z.array(z.unknown()).superRefine((items, ctx) => {
  if (items.length % 2 !== 0) {
    ctx.addIssue({ code: "custom", message: "must alternate keys and values (even length)" });
    return;
  }
  items.forEach((item, i) => {
    const ok =
      i % 2 === 0
        ? typeof item === "string"
        : typeof item === "object" && item !== null && !Array.isArray(item);
    if (!ok) {
      ctx.addIssue({
        code: "custom",
        path: [i],
        message: i % 2 === 0 ? "key must be a string" : "value must be an object",
      });
    }
  });
});

// HueSaturation.swift `HueSaturationSettings`.
export const hueSaturationSchema = record({
  range: colorRangeSchema,
  colorize: z.boolean(),
  invertRange: z.boolean(),
  adjustments: interleavedSchema,
  bands: interleavedSchema,
});

// LayerAdjustment.swift `LayerAdjustment`.
export const layerAdjustmentSchema = record({
  kind: adjustmentKindSchema,
  hue: z.number(),
  saturation: z.number(),
  lightness: z.number(),
  colorize: z.boolean(),
  hsvSettings: hueSaturationSchema.optional(),
  levels: levelsSchema,
  curves: curvesSchema,
  exposureSettings: exposureSettingsSchema.optional(),
  gradientMapSettings: gradientMapSettingsSchema.optional(),
  grainSettings: grainSettingsSchema.optional(),
  blackWhiteSettings: blackWhiteSettingsSchema.optional(),
  colorBalanceSettings: colorBalanceSettingsSchema.optional(),
  blurRadius: z.number().optional(),
  motionAngle: z.number().optional(),
  motionDistance: z.number().optional(),
  noiseAmount: z.number().optional(),
  noiseGaussian: z.boolean().optional(),
  noiseMonochromatic: z.boolean().optional(),
  noiseSeed: uint32Schema.optional(),
});
export type LayerAdjustment = z.output<typeof layerAdjustmentSchema>;
