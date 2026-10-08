// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/TypeTool.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// Also Compositor/Document/ShapeTool.swift. Every non-optional stored property is a required key
// (synthesized Codable), even with a default value; `T?` properties are optional. CGSize and CGPoint
// encode as two-number arrays. Value ranges are checked later by validateLikeCompositor
// (`LayerTextStyle.isValid`), not here.
import { z } from "zod";
import { optional, record } from "./extra";

// CGSize `[width, height]` / CGPoint `[x, y]`.
const pairSchema = z.tuple([z.number(), z.number()]);

// TypeTool.swift `TextAlignment`.
export const textAlignmentSchema = z.enum(["Left", "Center", "Right"]);

// TypeTool.swift `LayerTextColorRun`.
const textColorRunSchema = record({
  location: z.number().int(),
  length: z.number().int(),
  red: z.number(),
  green: z.number(),
  blue: z.number(),
});

// TypeTool.swift `LayerTextFontRun`.
const textFontRunSchema = record({
  location: z.number().int(),
  length: z.number().int(),
  fontName: z.string(),
});

// TypeTool.swift `LayerTextStyle`.
export const layerTextStyleSchema = record({
  content: z.string(),
  fontName: z.string(),
  fontSize: z.number(),
  red: z.number(),
  green: z.number(),
  blue: z.number(),
  alignment: textAlignmentSchema,
  tracking: z.number(),
  leading: z.number(),
  boxSize: optional(pairSchema),
  colorRuns: optional(z.array(textColorRunSchema)),
  fontRuns: optional(z.array(textFontRunSchema)),
});
export type LayerTextStyle = z.output<typeof layerTextStyleSchema>;

// ShapeTool.swift `ShapeKind`.
export const shapeKindSchema = z.enum(["Rectangle", "Ellipse", "Line"]);

// ShapeTool.swift `LayerShapeStyle`.
export const layerShapeStyleSchema = record({
  kind: shapeKindSchema,
  red: z.number(),
  green: z.number(),
  blue: z.number(),
  cornerRadius: z.number(),
  lineWidth: optional(z.number()),
  start: optional(pairSchema),
  end: optional(pairSchema),
});
export type LayerShapeStyle = z.output<typeof layerShapeStyleSchema>;
