import { describe, expect, it } from "vitest";
import type { AdjustmentSettings } from "../api";
import { exposureLut } from "./exposure";
import { defaultAdjustment } from "./settings";

function exposure(e: Partial<{ exposure: number; offset: number; gamma: number }>) {
  const s: AdjustmentSettings = defaultAdjustment("Exposure", 0);
  return exposureLut({ ...s, exposureSettings: { exposure: 0, offset: 0, gamma: 1, ...e } });
}

const byte = (lut: Float32Array, i: number, c = 0) => Math.round((lut[i * 4 + c] ?? 0) * 255);

describe("exposureLut", () => {
  it("is the identity at the defaults, set or unset", () => {
    for (const lut of [exposureLut(defaultAdjustment("Exposure", 0)), exposure({})]) {
      for (let i = 0; i < 256; i++) {
        for (let c = 0; c < 3; c++) {
          expect(Math.abs((lut[i * 4 + c] ?? 0) - i / 255)).toBeLessThanOrEqual(1 / 255);
        }
        expect(lut[i * 4 + 3]).toBe(1);
      }
    }
  });

  // ImageAdjustmentTests.swift exposureWorksInLinearLightWithOffsetAndGamma
  it("works in linear light with exposure, offset and gamma", () => {
    const brighter = exposure({ exposure: 1 });
    expect(Math.abs(byte(brighter, 128) - 176)).toBeLessThanOrEqual(2);
    expect(byte(brighter, 128, 0)).toBe(byte(brighter, 128, 2));
    expect(Math.abs(byte(exposure({ gamma: 2 }), 128) - 181)).toBeLessThanOrEqual(2);
    expect(Math.abs(byte(exposure({ offset: 0.1 }), 0) - 89)).toBeLessThanOrEqual(2);
  });
});
