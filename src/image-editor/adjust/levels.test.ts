import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AdjustmentSettings } from "../api";
import { autoLevels, histogram, levelsLut } from "./levels";
import { defaultAdjustment } from "./settings";

type Levels = AdjustmentSettings["levels"];
type Range = Levels["ranges"][number];

const fixtures = JSON.parse(
  readFileSync("src/image-editor/adjust/__fixtures__/levels.json", "utf8"),
) as { cases: { levels: Levels; out: number[] }[] };

const ID: Range = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };

function withRanges(...ranges: Partial<Range>[]): AdjustmentSettings {
  const all = [0, 1, 2, 3].map((i) => ({ ...ID, ...ranges[i] }));
  return { ...defaultAdjustment("Levels", 0), levels: { channel: "RGB", ranges: all } };
}

// Output byte of channel c for input byte i.
const byte = (lut: Float32Array, i: number, c = 0) => Math.round((lut[i * 4 + c] ?? 0) * 255);

describe("levelsLut", () => {
  it("matches Compositor's C kernel within 1 for every fixture case", () => {
    expect(fixtures.cases).toHaveLength(4);
    for (const { levels, out } of fixtures.cases) {
      const lut = levelsLut({ ...defaultAdjustment("Levels", 0), levels });
      for (let i = 0; i < 256; i++) {
        for (let c = 0; c < 3; c++) {
          expect(Math.abs(byte(lut, i, c) - (out[i * 3 + c] ?? -1))).toBeLessThanOrEqual(1);
        }
        expect(lut[i * 4 + 3]).toBe(1);
      }
    }
  });

  // LevelsTests.swift inputClippingGammaOutputInversionAndAlpha
  it("clips input, bends gamma and inverts output", () => {
    const clipped = levelsLut(withRanges({ black: 64, white: 128 }));
    expect([byte(clipped, 0), byte(clipped, 64), byte(clipped, 128)]).toEqual([0, 0, 255]);
    const brightened = levelsLut(withRanges({ gamma: 2 }));
    expect(Math.abs(byte(brightened, 64) - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(byte(brightened, 128) - 181)).toBeLessThanOrEqual(1);
    const inverted = levelsLut(withRanges({ outputBlack: 255, outputWhite: 0 }));
    expect([byte(inverted, 0), byte(inverted, 255)]).toEqual([255, 0]);
  });

  // LevelsTests.swift channelsCoexistAndUseDocumentedOrder
  it("applies the channel range before the RGB range", () => {
    const lut = levelsLut(withRanges({ black: 40, white: 210 }, { gamma: 2 }));
    const red = Math.pow(64 / 255, 1 / 2);
    const expected = Math.min(1, Math.max(0, (red * 255 - 40) / 170));
    expect(Math.abs(byte(lut, 64, 0) - expected * 255)).toBeLessThanOrEqual(1);
    expect(byte(lut, 64, 1)).toBe(byte(lut, 64, 2));
    expect(byte(lut, 64, 0)).toBeGreaterThan(byte(lut, 64, 1));
  });

  it("normalizes out-of-range values like LevelRange.normalized", () => {
    const lut = levelsLut(
      withRanges({ black: 300, gamma: Number.NaN, white: -1, outputBlack: -100, outputWhite: 400 }),
    );
    // black 254, white 255, gamma 1, output 0–255.
    expect([byte(lut, 254), byte(lut, 255)]).toEqual([0, 255]);
  });
});

describe("histogram", () => {
  it("counts each channel and luma, leaving out transparent pixels", () => {
    const h = histogram(
      new Uint8Array([255, 0, 0, 255, 0, 128, 0, 128, 10, 20, 30, 255, 200, 200, 200, 0]),
    );
    expect(h.r[255]).toBe(1);
    expect(h.r[0]).toBe(1);
    expect(h.r[10]).toBe(1);
    expect(h.r[200]).toBe(0);
    expect(h.g[128]).toBe(1);
    expect(h.b[30]).toBe(1);
    expect(h.luma[Math.round(0.299 * 255)]).toBe(1);
    expect(h.luma[Math.round(0.587 * 128)]).toBe(1);
    expect(h.luma[Math.round(0.299 * 10 + 0.587 * 20 + 0.114 * 30)]).toBe(1);
    expect(h.luma.reduce((a, n) => a + n, 0)).toBe(3);
  });
});

const empty = () => ({
  r: new Uint32Array(256),
  g: new Uint32Array(256),
  b: new Uint32Array(256),
  luma: new Uint32Array(256),
});

describe("autoLevels", () => {
  it("stretches a 50–200 gray histogram to black 50, white 200", () => {
    const h = empty();
    for (let v = 50; v <= 200; v++) for (const bins of [h.r, h.g, h.b, h.luma]) bins[v] = 10;
    const current = defaultAdjustment("Levels", 0);
    const s = autoLevels(h, current);
    expect(s.levels.ranges[0]).toEqual({ ...ID, black: 50, white: 200 });
    expect(s.levels.ranges.slice(1)).toEqual([ID, ID, ID]);
    expect({ ...s, levels: current.levels }).toEqual(current);
  });

  // LevelsTests.swift autoAlgorithmsAndEyedropperCalibration (Contrast)
  it("shares one interval across channels and leaves empty histograms alone", () => {
    const h = empty();
    [h.r, h.g, h.b].forEach((bins, i) => {
      bins[20 * (i + 1)] = 100;
      bins[200 + (i + 1) * 10] = 100;
    });
    const s = autoLevels(h, defaultAdjustment("Levels", 0));
    expect(s.levels.ranges[0]).toMatchObject({ black: 20, white: 230 });
    expect(autoLevels(empty(), defaultAdjustment("Levels", 0)).levels.ranges).toEqual([
      ID,
      ID,
      ID,
      ID,
    ]);
  });
});
