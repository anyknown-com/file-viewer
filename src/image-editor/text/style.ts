import type { LayerTextStyle } from "../../comp/index";

export type ColorRun = NonNullable<LayerTextStyle["colorRuns"]>[number];
export type FontRun = NonNullable<LayerTextStyle["fontRuns"]>[number];

/** Compositor TypeTool.swift `padding`: text starts this far from the layer's top-left. */
export const TEXT_PADDING = 12;
export const MIN_TEXT_SIDE = 16;
export const MAX_CONTENT = 100_000;
export const MIN_BOX = 16;
export const MAX_BOX = 30_000;

export function defaultTextStyle(content = ""): LayerTextStyle {
  return {
    content,
    fontName: "Geist-Regular",
    fontSize: 48,
    red: 0,
    green: 0,
    blue: 0,
    alignment: "Left",
    tracking: 0,
    leading: 0,
  };
}

/** Line height in px: `leading`, or 120% of the font size when leading is 0 (auto). */
export function lineHeight(s: LayerTextStyle): number {
  return s.leading || 1.2 * s.fontSize;
}
