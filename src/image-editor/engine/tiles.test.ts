import { afterEach, describe, expect, it } from "vitest";
import type { Layer } from "../api";
import { registerAdjustment, resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { exportTiles, totalReach } from "./tiles";

afterEach(resetRegistry);

// Only the canvas size matters here. makeDoc goes through 09's fromImage, which allocates and
// PNG-encodes width × height pixels: at 5000 × 3000 that alone ran past CI's 5 s test timeout.
function canvasOf(width: number, height: number) {
  const doc = makeDoc({ width: 1, height: 1, layers: [] });
  return { ...doc, manifest: { ...doc.manifest, width, height } };
}

describe("exportTiles", () => {
  it("covers 5000 × 3000 in 2048 tiles with smaller right and bottom edges", () => {
    const doc = canvasOf(5000, 3000);
    const tiles = exportTiles(doc, 2048, 0, 16384);
    expect(tiles).toHaveLength(6);
    expect(tiles[0]).toEqual({ x: 0, y: 0, width: 2048, height: 2048 });
    expect(tiles[2]).toEqual({ x: 4096, y: 0, width: 904, height: 2048 });
    expect(tiles[5]).toEqual({ x: 4096, y: 2048, width: 904, height: 952 });
    expect(tiles.reduce((sum, t) => sum + t.width * t.height, 0)).toBe(5000 * 3000);
  });

  it("returns one whole tile when a tile plus reach exceeds maxTexture", () => {
    const doc = canvasOf(5000, 3000);
    expect(exportTiles(doc, 2048, 1100, 4096)).toEqual([{ x: 0, y: 0, width: 5000, height: 3000 }]);
  });
});

describe("totalReach", () => {
  it("takes the largest adjustment reach", () => {
    const adjustment = { kind: "Gaussian Blur", blurRadius: 10 } as unknown as Layer["adjustment"];
    registerAdjustment("Gaussian Blur", {
      pass: () => {},
      reach: (s, scale) => (s.blurRadius ?? 0) * 3 * scale,
    });
    const doc = makeDoc({ width: 10, height: 10, layers: [{}, { adjustment }] });
    expect(totalReach(doc, 0.5)).toBe(15);
  });
});
