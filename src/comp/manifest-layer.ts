// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/IO/ProjectStore.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// Also Compositor/Document/LayerAppearance.swift and LayerTransform.swift. Every non-optional
// stored property is a required key (synthesized Codable), even with a default value; `T?`
// properties are optional. Value ranges are checked later by validateLikeCompositor, not here.
import { z } from "zod";
import { optional, record } from "./extra";
import { layerAdjustmentSchema } from "./manifest-adjust";
import { layerEffectsSchema } from "./manifest-effects";
import { uuidSchema } from "./manifest-guides";
import { layerShapeStyleSchema, layerTextStyleSchema } from "./manifest-text-shape";

// LayerAppearance.swift `LayerBlendMode` raw values, in declaration order.
export const blendModeSchema = z.enum([
  "Normal",
  "Darken",
  "Multiply",
  "Color Burn",
  "Linear Burn",
  "Lighten",
  "Screen",
  "Color Dodge",
  "Linear Dodge (Add)",
  "Overlay",
  "Soft Light",
  "Hard Light",
  "Vivid Light",
  "Linear Light",
  "Pin Light",
  "Hard Mix",
  "Difference",
  "Exclusion",
  "Subtract",
  "Divide",
  "Hue",
  "Saturation",
  "Color",
  "Luminosity",
]);
export type BlendMode = z.output<typeof blendModeSchema>;

// LayerTransform.swift `LayerSampling`.
export const layerSamplingSchema = z.enum(["Nearest", "Smooth", "High quality"]);

// CGPoint `[x, y]` / CGSize `[width, height]`.
const pairSchema = z.tuple([z.number(), z.number()]);

// LayerTransform.swift `LayerTransform`: `rotation`, `flipX`, `flipY` and `sampling` have default
// values but are still required keys.
export const layerTransformSchema = record({
  origin: pairSchema,
  size: pairSchema,
  rotation: z.number(),
  flipX: z.boolean(),
  flipY: z.boolean(),
  sampling: layerSamplingSchema,
});
export type LayerTransform = z.output<typeof layerTransformSchema>;

// ProjectStore.swift `ProjectLayerRecord`.
export const layerRecordSchema = record({
  id: uuidSchema,
  name: z.string(),
  isVisible: z.boolean(),
  transform: layerTransformSchema,
  imageFile: optional(z.string()),
  parentID: optional(uuidSchema),
  isGroup: optional(z.boolean()),
  opacity: optional(z.number()),
  blendMode: optional(blendModeSchema),
  maskFile: optional(z.string()),
  maskEnabled: optional(z.boolean()),
  maskSourceID: optional(uuidSchema),
  adjustment: optional(layerAdjustmentSchema),
  maskPlacement: optional(layerTransformSchema),
  maskLinked: optional(z.boolean()),
  shape: optional(layerShapeStyleSchema),
  effects: optional(layerEffectsSchema),
  text: optional(layerTextStyleSchema),
});
export type LayerRecord = z.output<typeof layerRecordSchema>;
