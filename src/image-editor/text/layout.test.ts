import { describe, expect, it } from "vitest";
import type { LayerTextStyle } from "../../comp/index";
import { type Measure, layoutText } from "./layout";
import { defaultTextStyle } from "./style";

// Each UTF-16 unit is fontSize × 0.5 wide, plus tracking after it.
const measure: Measure = (text, _font, size, tracking) => text.length * (size * 0.5 + tracking);

function style(content: string, patch: Partial<LayerTextStyle> = {}): LayerTextStyle {
  return { ...defaultTextStyle(content), fontSize: 20, ...patch };
}

function texts(s: LayerTextStyle): string[] {
  return layoutText(s, measure).lines.map((l) => s.content.slice(l.start, l.end));
}

describe("layoutText", () => {
  it("wraps English at word breaks inside a 200 px box", () => {
    const s = style("the quick brown fox jumps", { boxSize: [200, 100] });
    expect(texts(s)).toEqual(["the quick brown", "fox jumps"]);
  });

  it("breaks a word wider than the line between characters", () => {
    const s = style("abcdefghijklmnopqrstuvwxyz", { boxSize: [200, 100] });
    expect(texts(s)).toEqual(["abcdefghijklmnopq", "rstuvwxyz"]);
  });

  it("breaks Chinese between any two characters", () => {
    const s = style("一二三四五六七八九十一二三四五六七八九十", { boxSize: [200, 100] });
    expect(texts(s)).toEqual(["一二三四五六七八九十一二三四五六七", "八九十"]);
  });

  it("breaks at \\n", () => {
    const s = style("ab\ncd");
    const { lines } = layoutText(s, measure);
    expect(texts(s)).toEqual(["ab", "cd"]);
    expect(lines.map((l) => l.start)).toEqual([0, 3]);
  });

  it("does not wrap point text", () => {
    const s = style("a ".repeat(100).trim());
    const { lines } = layoutText(s, measure);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.width).toBe(1990);
  });

  it("adds tracking to measured widths and wraps earlier", () => {
    expect(texts(style("aaaa bbbb cccc", { boxSize: [200, 100] }))).toEqual(["aaaa bbbb cccc"]);
    const s = style("aaaa bbbb cccc", { boxSize: [200, 100], tracking: 10 });
    expect(texts(s)).toEqual(["aaaa", "bbbb", "cccc"]);
    expect(layoutText(s, measure).lines[0]?.width).toBe(80);
  });

  it("uses 1.2 × fontSize as line height when leading is 0, else leading", () => {
    const auto = layoutText(style("a\nb"), measure).lines;
    expect(auto.map((l) => l.top)).toEqual([12, 36]);
    const fixed = layoutText(style("a\nb", { leading: 30 }), measure).lines;
    expect(fixed.map((l) => l.top)).toEqual([12, 42]);
  });

  it("places lines for each alignment", () => {
    const x = (alignment: LayerTextStyle["alignment"]) =>
      layoutText(style("abc", { boxSize: [200, 100], alignment }), measure).lines[0]?.x;
    expect(x("Left")).toBe(12);
    expect(x("Center")).toBe(12 + (176 - 30) / 2);
    expect(x("Right")).toBe(12 + 176 - 30);
    const point = layoutText(style("abcd\nab", { alignment: "Right" }), measure).lines;
    expect(point.map((l) => l.x)).toEqual([12, 32]);
  });

  it("sizes point text from the widest line and the line count", () => {
    expect(layoutText(style("ab\nabc"), measure)).toMatchObject({ width: 56, height: 72 });
    expect(layoutText(style(""), measure)).toMatchObject({ width: 26, height: 48 });
    const tiny = layoutText(style("", { fontSize: 1 }), measure);
    expect(tiny).toMatchObject({ width: 25, height: 26 });
    expect(Math.min(tiny.width, tiny.height)).toBeGreaterThanOrEqual(16);
  });

  it("uses boxSize as the canvas of a paragraph box", () => {
    expect(layoutText(style("abc", { boxSize: [200, 90] }), measure)).toMatchObject({
      width: 200,
      height: 90,
    });
  });

  it("splits a line into pieces at a font run", () => {
    const s = style("abcdef", { fontRuns: [{ location: 3, length: 3, fontName: "Geist-Bold" }] });
    const [a, b] = layoutText(s, measure).lines[0]?.pieces ?? [];
    expect(a).toMatchObject({ start: 0, end: 3, x: 12, width: 30, fontName: "Geist-Regular" });
    expect(b).toMatchObject({ start: 3, end: 6, width: 30, fontName: "Geist-Bold" });
    expect(b?.x).toBe((a?.x ?? 0) + (a?.width ?? 0));
  });

  it("does not count trailing white space in the line width", () => {
    const { lines } = layoutText(style("abc   "), measure);
    expect(lines[0]).toMatchObject({ start: 0, end: 3, width: 30 });
  });
});
