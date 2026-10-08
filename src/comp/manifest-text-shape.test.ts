// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toJsonValue } from "./extra";
import { canvasGuideSchema } from "./manifest-guides";
import { layerShapeStyleSchema, layerTextStyleSchema } from "./manifest-text-shape";

const text = {
  content: "Hello world",
  fontName: "Helvetica",
  fontSize: 72,
  red: 0,
  green: 0,
  blue: 0,
  alignment: "Left",
  tracking: 0,
  leading: 0,
  boxSize: [400, 200],
  colorRuns: [{ location: 0, length: 5, red: 1, green: 0, blue: 0 }],
  fontRuns: [{ location: 6, length: 5, fontName: "Helvetica-Bold" }],
};

function paths(result: { error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return result.error?.issues.map((i) => i.path.join(".")) ?? [];
}

describe("layerTextStyleSchema", () => {
  it("accepts a full text style and writes it back unchanged", () => {
    expect(toJsonValue(layerTextStyleSchema.parse(text))).toEqual(text);
  });

  it("requires fields that have a Swift default value", () => {
    const { tracking: _tracking, ...noTracking } = text;
    const result = layerTextStyleSchema.safeParse(noTracking);
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("tracking");
  });

  it("treats boxSize and runs as optional", () => {
    const { boxSize: _b, colorRuns: _c, fontRuns: _f, ...plain } = text;
    expect(layerTextStyleSchema.safeParse(plain).success).toBe(true);
    expect(layerTextStyleSchema.safeParse({ ...plain, boxSize: null }).success).toBe(true);
  });

  it("reads boxSize as a CGSize array", () => {
    expect(layerTextStyleSchema.safeParse({ ...text, boxSize: [400, 200] }).success).toBe(true);
    const result = layerTextStyleSchema.safeParse({ ...text, boxSize: { width: 400 } });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("boxSize");
  });

  it("spells alignment as Compositor does", () => {
    const result = layerTextStyleSchema.safeParse({ ...text, alignment: "center" });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("alignment");
  });

  it("requires integer run locations", () => {
    const result = layerTextStyleSchema.safeParse({
      ...text,
      fontRuns: [{ location: 0.5, length: 5, fontName: "Helvetica" }],
    });
    expect(paths(result)).toContain("fontRuns.0.location");
  });
});

describe("layerShapeStyleSchema", () => {
  const rect = { kind: "Rectangle", red: 0.2, green: 0.4, blue: 0.6, cornerRadius: 8 };

  it("accepts a rectangle without line fields", () => {
    expect(toJsonValue(layerShapeStyleSchema.parse(rect))).toEqual(rect);
  });

  it("accepts a line with start and end points", () => {
    const line = { ...rect, kind: "Line", lineWidth: 4, start: [0, 0], end: [1, 1] };
    expect(toJsonValue(layerShapeStyleSchema.parse(line))).toEqual(line);
  });

  it("rejects a missing cornerRadius and an unknown kind", () => {
    const { cornerRadius: _r, ...noRadius } = rect;
    expect(paths(layerShapeStyleSchema.safeParse(noRadius))).toContain("cornerRadius");
    expect(paths(layerShapeStyleSchema.safeParse({ ...rect, kind: "Star" }))).toContain("kind");
  });
});

describe("canvasGuideSchema", () => {
  it("uppercases a lowercase UUID", () => {
    const parsed = canvasGuideSchema.parse({
      id: "6f1d3c2a-0b7e-4e8a-9c4d-2a1b3c4d5e6f",
      axis: "horizontal",
      position: 120,
    });
    expect(parsed.id).toBe("6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F");
  });

  it("rejects a malformed id and an unknown axis", () => {
    const guide = { id: "6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F", axis: "vertical", position: 0 };
    expect(paths(canvasGuideSchema.safeParse({ ...guide, id: "not-a-uuid" }))).toContain("id");
    expect(paths(canvasGuideSchema.safeParse({ ...guide, axis: "diagonal" }))).toContain("axis");
  });
});
