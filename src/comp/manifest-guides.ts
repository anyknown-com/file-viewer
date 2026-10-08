// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/Guides.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import { z } from "zod";
import { record } from "./extra";

// Swift UUID: decoding accepts either case; `uuidString` (what Compositor compares and writes) is
// uppercase, so every id is uppercased once parsed.
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((s) => s.toUpperCase());

// Guides.swift `CanvasGuide` and `CanvasGuide.Axis`.
export const canvasGuideSchema = record({
  id: uuidSchema,
  axis: z.enum(["horizontal", "vertical"]),
  position: z.number(),
});
/** A guide line on the canvas. */
export type CanvasGuide = z.output<typeof canvasGuideSchema>;
