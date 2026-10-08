import { describe, expect, it } from "vitest";
import { GEIST_WEIGHTS, cssFont, missingFonts, replaceMissingFonts, weightOf } from "./fonts";
import { defaultTextStyle } from "./style";

describe("Geist fonts", () => {
  it("maps the nine PostScript names to 100–900", () => {
    expect(GEIST_WEIGHTS.map((w) => [w.name, weightOf(w.name)])).toEqual([
      ["Geist-Thin", 100],
      ["Geist-ExtraLight", 200],
      ["Geist-Light", 300],
      ["Geist-Regular", 400],
      ["Geist-Medium", 500],
      ["Geist-SemiBold", 600],
      ["Geist-Bold", 700],
      ["Geist-ExtraBold", 800],
      ["Geist-Black", 900],
    ]);
    expect(weightOf("Helvetica-Bold")).toBeNull();
  });

  it("lists fonts that are not Geist", () => {
    expect(missingFonts({ ...defaultTextStyle("abc"), fontName: "Helvetica-Bold" })).toEqual([
      "Helvetica-Bold",
    ]);
    expect(missingFonts({ ...defaultTextStyle("abc"), fontName: "Geist-Bold" })).toEqual([]);
  });

  it("lists missing fonts in fontRuns once each", () => {
    const s = {
      ...defaultTextStyle("abcdef"),
      fontName: "Helvetica",
      fontRuns: [
        { location: 0, length: 1, fontName: "Menlo" },
        { location: 1, length: 1, fontName: "Geist-Bold" },
        { location: 2, length: 1, fontName: "Menlo" },
        { location: 3, length: 1, fontName: "Helvetica" },
      ],
    };
    expect(missingFonts(s)).toEqual(["Helvetica", "Menlo"]);
    const fixed = replaceMissingFonts(s);
    expect(missingFonts(fixed)).toEqual([]);
    expect(fixed.fontName).toBe("Geist-Regular");
    expect(fixed.fontRuns).toEqual([
      { location: 0, length: 1, fontName: "Geist-Regular" },
      { location: 1, length: 1, fontName: "Geist-Bold" },
      { location: 2, length: 2, fontName: "Geist-Regular" },
    ]);
  });

  it("builds a CSS font string", () => {
    expect(cssFont("Geist-Bold", 24)).toBe('700 24px "Geist Variable"');
    expect(cssFont("Helvetica", 10)).toBe('400 10px "Geist Variable"');
  });
});
