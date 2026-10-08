import { describe, expect, it } from "vitest";
import type { LayerShapeStyle } from "../../comp/index";
import { defaultShapeStyle, renderShape } from "./render";

const alphaAt = (r: ReturnType<typeof renderShape>, x: number, y: number) =>
  r.data[(y * r.width + x) * 4 + 3];
const style = (patch: Partial<LayerShapeStyle>): LayerShapeStyle => ({
  ...defaultShapeStyle("Rectangle"),
  ...patch,
});

describe("renderShape", () => {
  it("fills a rectangle completely", () => {
    const r = renderShape(style({}), 200, 100);
    expect(r.data.length).toBe(200 * 100 * 4);
    for (let i = 3; i < r.data.length; i += 4) if (r.data[i] !== 255) throw new Error(`alpha ${i}`);
  });

  it("uses the style color", () => {
    const r = renderShape(style({ red: 1, green: 0, blue: 0.5 }), 4, 4);
    expect(Array.from(r.data.slice(0, 4))).toEqual([255, 0, 128, 255]);
  });

  it("rounds corners", () => {
    const r = renderShape(style({ cornerRadius: 20 }), 200, 100);
    expect(alphaAt(r, 1, 1)).toBe(0);
    expect(alphaAt(r, 100, 50)).toBe(255);
  });

  it("draws an ellipse with a clear corner", () => {
    const r = renderShape(style({ kind: "Ellipse" }), 100, 60);
    expect(alphaAt(r, 50, 30)).toBe(255);
    expect(alphaAt(r, 1, 1)).toBe(0);
  });

  it("draws a diagonal line through the middle", () => {
    const r = renderShape(style({ kind: "Line", lineWidth: 10 }), 100, 100);
    expect(alphaAt(r, 50, 50)).toBe(255);
    expect(alphaAt(r, 95, 5)).toBe(0);
  });

  it("redraws a doubled rectangle with at most 1 px of soft edge", () => {
    const r = renderShape(style({ cornerRadius: 0 }), 400, 200);
    for (let x = 0; x < 400; x++) {
      const soft = [0, 199].filter((y) => alphaAt(r, x, y) !== 255);
      expect(soft.length).toBe(0);
    }
    let soft = 0;
    for (let x = 0; x < 400; x++)
      if (alphaAt(r, x, 100) !== 0 && alphaAt(r, x, 100) !== 255) soft++;
    expect(soft).toBeLessThanOrEqual(1);
  });
});
