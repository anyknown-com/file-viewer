import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentFill, type ContentFillInput } from "./content-fill";

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(`src/image-editor/tools/heal/__fixtures__/${name}`));

/** A layer of `color(x, y)` with the rectangle [x0, x1) × [y0, y1) painted red and selected. */
function scene(
  width: number,
  height: number,
  color: (x: number, y: number) => number[],
  [x0, y0, x1, y1]: [number, number, number, number],
): ContentFillInput {
  const data = new Uint8Array(width * height * 4);
  const hole = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      data.set(inside ? [255, 0, 0, 255] : color(x, y), (y * width + x) * 4);
      if (inside) hole[y * width + x] = 255;
    }
  }
  return { width, height, data, hole };
}

const gray = (x: number) => (Math.floor(x / 4) % 2 === 0 ? 51 : 204);

describe("contentFill", () => {
  it("matches Compositor's C kernel within 1 per channel", () => {
    const data = fixture("heal-input.rgba");
    const hole = fixture("heal-mask.r8");
    const out = contentFill({ width: 64, height: 64, data, hole });
    const expected = fixture("content-fill.rgba");
    let max = 0;
    for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]! - expected[i]!));
    expect(max).toBeLessThanOrEqual(1);
  });

  it("leaves every pixel outside the hole byte for byte", () => {
    const data = fixture("heal-input.rgba");
    const hole = fixture("heal-mask.r8");
    const out = contentFill({ width: 64, height: 64, data: data.slice(), hole });
    const outside = (bytes: Uint8Array) => bytes.filter((_, i) => !hole[i >> 2]);
    expect(outside(out)).toEqual(outside(data));
  });

  // Compositor's SmartEditTests.fillContinuesRepeatingTexture.
  it("continues a repeating texture through the hole", () => {
    const input = scene(80, 64, (x) => [gray(x), gray(x), gray(x), 255], [32, 26, 44, 36]);
    const out = contentFill(input);
    let matching = 0;
    for (let y = 26; y < 36; y++)
      for (let x = 32; x < 44; x++) if (Math.abs(out[(y * 80 + x) * 4]! - gray(x)) <= 1) matching++;
    expect(matching).toBeGreaterThanOrEqual(114);
  });

  // Compositor's SmartEditTests.fillReconstructsBackgroundInsideSelectionAndUndoes.
  it("reconstructs a flat background inside the hole", () => {
    const input = scene(64, 48, () => [51, 153, 204, 255], [20, 16, 32, 26]);
    const out = contentFill(input);
    for (let p = 0; p < 64 * 48; p++)
      expect([...out.subarray(p * 4, p * 4 + 4)]).toEqual([51, 153, 204, 255]);
  });

  // Compositor's SmartEditTests.cancelAndNoSourceLeaveOriginalUntouched: all selected, nothing to copy.
  it("throws when nothing outside the hole is opaque", () => {
    const input = scene(16, 16, () => [0, 0, 0, 255], [0, 0, 16, 16]);
    const before = input.data.slice();
    expect(() => contentFill(input)).toThrow(Error);
    expect(input.data).toEqual(before);
  });

  it("returns the pixels unchanged when the hole is empty", () => {
    const input = scene(8, 8, () => [10, 20, 30, 255], [0, 0, 0, 0]);
    expect(contentFill(input)).toEqual(input.data);
  });

  it("throws RangeError for a hole over 4 megapixels", () => {
    const width = 2001;
    const height = 2000;
    const input = {
      width,
      height,
      data: new Uint8Array(width * height * 4),
      hole: new Uint8Array(width * height).fill(255),
    };
    expect(() => contentFill(input)).toThrow(RangeError);
  });

  it("throws AbortError once the signal is aborted", () => {
    const controller = new AbortController();
    controller.abort();
    const input = {
      width: 64,
      height: 64,
      data: fixture("heal-input.rgba"),
      hole: fixture("heal-mask.r8"),
    };
    expect(() => contentFill(input, controller.signal)).toThrow(
      expect.objectContaining({ name: "AbortError" }),
    );
  });
});
