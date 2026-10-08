import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { EditorApi, Layer } from "../api";
import { makeDoc } from "../test/make-doc";
import { textShapeThumbnail } from "./thumbs";

const api = {} as EditorApi;
const text = (content: string): NonNullable<Layer["text"]> => ({
  content,
  fontName: "Geist-Regular",
  fontSize: 48,
  red: 0,
  green: 0,
  blue: 0,
  alignment: "Left",
  tracking: 0,
  leading: 0,
});
const shape = (kind: "Rectangle" | "Ellipse" | "Line"): NonNullable<Layer["shape"]> => ({
  kind,
  red: 0,
  green: 0,
  blue: 0,
  cornerRadius: 0,
});
const layerOf = (patch: Partial<Layer>): Layer =>
  makeDoc({ width: 100, height: 100, layers: [patch] }).manifest.layers[0];
const html = (layer: Layer) => renderToStaticMarkup(<>{textShapeThumbnail(layer, api)}</>);

it("text layer shows the first 8 graphemes", () => {
  const out = html(layerOf({ text: text("abcdefghijk") }));
  expect(out).toContain("fv-text-thumb");
  expect(out).toContain("<span>abcdefgh</span>");
});

it("does not split a family emoji", () => {
  // 1 family emoji + 5 CJK = 6 graphemes, all kept; a 12-grapheme string cuts after 8 whole graphemes.
  expect(html(layerOf({ text: text("👨‍👩‍👧家族照片") }))).toContain("<span>👨‍👩‍👧家族照片</span>");
  expect(html(layerOf({ text: text("👨‍👩‍👧1234567890") }))).toContain("<span>👨‍👩‍👧1234567</span>");
});

it("shape layers get their own icon", () => {
  const rect = html(layerOf({ shape: shape("Rectangle") }));
  const ellipse = html(layerOf({ shape: shape("Ellipse") }));
  const line = html(layerOf({ shape: shape("Line") }));
  expect(new Set([rect, ellipse, line]).size).toBe(3);
  expect(rect).toContain("<rect");
  expect(ellipse).toContain("<ellipse");
  expect(line).toContain("M5 19");
});

it("plain layers return null", () => {
  expect(textShapeThumbnail(layerOf({}), api)).toBeNull();
});
