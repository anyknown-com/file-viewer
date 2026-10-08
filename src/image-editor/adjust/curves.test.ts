import { describe, expect, it } from "vitest";
import type { AdjustmentSettings } from "../api";
import { curveSample, curvesLut } from "./curves";
import { defaultAdjustment } from "./settings";

type Point = { x: number; y: number };

function withMaster(points: Point[]): AdjustmentSettings {
  const s = defaultAdjustment("Curves", 0);
  return { ...s, curves: { ...s.curves, channels: [points, ...s.curves.channels.slice(1)] } };
}

const byte = (lut: Float32Array, i: number, c = 0) => Math.round((lut[i * 4 + c] ?? 0) * 255);

describe("curveSample", () => {
  it("is the identity for the two-point diagonal", () => {
    const diagonal = [
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ];
    for (let x = 0; x <= 255; x++) expect(curveSample(diagonal, x)).toBeCloseTo(x, 9);
  });

  it("never decreases while the points increase", () => {
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 50; n++) {
      const count = 2 + Math.floor(rand() * 8);
      const xs = new Set([0, 255]);
      while (xs.size < count) xs.add(1 + Math.floor(rand() * 254));
      const ys = Array.from({ length: count }, () => rand() * 255).toSorted((a, b) => a - b);
      const points = [...xs].toSorted((a, b) => a - b).map((x, i) => ({ x, y: ys[i] ?? 0 }));
      let last = -Infinity;
      for (let x = 0; x <= 255; x += 0.5) {
        const y = curveSample(points, x);
        expect(y).toBeGreaterThanOrEqual(last - 1e-9);
        last = y;
      }
    }
  });
});

describe("curvesLut", () => {
  it("is the identity by default", () => {
    const lut = curvesLut(defaultAdjustment("Curves", 0));
    for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) expect(byte(lut, i, c)).toBe(i);
  });

  // AdjustmentLayerTests.swift: an inverted master curve, a flat white curve, a flat black curve.
  it("matches Compositor's master-curve cases", () => {
    const inverted = curvesLut(
      withMaster([
        { x: 0, y: 255 },
        { x: 255, y: 0 },
      ]),
    );
    expect([byte(inverted, 0), byte(inverted, 255)]).toEqual([255, 0]);
    const white = curvesLut(
      withMaster([
        { x: 0, y: 255 },
        { x: 255, y: 255 },
      ]),
    );
    expect([byte(white, 0), byte(white, 102), byte(white, 255)]).toEqual([255, 255, 255]);
    const black = curvesLut(
      withMaster([
        { x: 0, y: 0 },
        { x: 255, y: 0 },
      ]),
    );
    expect([byte(black, 0), byte(black, 179), byte(black, 255)]).toEqual([0, 0, 0]);
  });

  it("applies the channel curve before the RGB curve", () => {
    const s = defaultAdjustment("Curves", 0);
    const lift = [
      { x: 0, y: 0 },
      { x: 128, y: 190 },
      { x: 255, y: 255 },
    ];
    const half = [
      { x: 0, y: 0 },
      { x: 255, y: 128 },
    ];
    const lut = curvesLut({
      ...s,
      curves: { channel: "RGB", channels: [half, lift, s.curves.channels[2] ?? [], lift] },
    });
    expect(byte(lut, 128, 0)).toBe(Math.round(curveSample(half, 190)));
    expect(byte(lut, 128, 1)).toBe(Math.round(curveSample(half, 128)));
  });
});
