import { describe, expect, it } from "vitest";
import type { AdjustmentSettings } from "../api";
import { adjustedSaturation, hueSaturationLut, hueSaturationRgb } from "./hue-saturation";
import { bandWeight, readBands } from "./hue-saturation-bands";
import { sampleLut3d } from "./lut3d";
import { defaultAdjustment } from "./settings";

type Adj = { hue?: number; saturation?: number; lightness?: number };
type Band = { falloffStart: number; rangeStart: number; rangeEnd: number; falloffEnd: number };

// `HueSaturationSettings` as Compositor encodes it: dictionaries as alternating key / value arrays.
function hsv(
  adjustments: [string, Adj][],
  opts: {
    range?: string;
    colorize?: boolean;
    invertRange?: boolean;
    bands?: [string, Band][];
  } = {},
): AdjustmentSettings {
  const full = (a: Adj) => ({ hue: 0, saturation: 0, lightness: 0, ...a });
  return {
    ...defaultAdjustment("Hue/Saturation", 0),
    hsvSettings: {
      range: (opts.range ?? "Master") as "Master",
      colorize: opts.colorize ?? false,
      invertRange: opts.invertRange ?? false,
      adjustments: adjustments.flatMap(([k, v]) => [k, full(v)]),
      bands: (opts.bands ?? []).flatMap(([k, v]) => [k, v]),
    },
  };
}

const bytes = (rgb: readonly number[]) => rgb.map((v) => Math.round(v * 255));
const near = (got: readonly number[], want: readonly number[], tolerance = 8) =>
  bytes(got).every((v, i) => Math.abs(v - (want[i] ?? -99)) <= tolerance);

// HueSaturationTests.swift, on single colors instead of a rendered canvas.
describe("hueSaturationRgb", () => {
  it("rotates hue and moves saturation and lightness as Photoshop does", () => {
    expect(near(hueSaturationRgb(hsv([["Master", { hue: 120 }]]), 1, 0, 0), [0, 255, 0])).toBe(
      true,
    );
    expect(bytes(hueSaturationRgb(hsv([["Master", { hue: 120 }]]), 0.5, 0.5, 0.5))).toEqual([
      128, 128, 128,
    ]);
    const [r, g, b] = bytes(hueSaturationRgb(hsv([["Master", { saturation: -100 }]]), 1, 0, 0));
    expect(r === g && g === b).toBe(true);
    expect(
      near(hueSaturationRgb(hsv([["Master", { lightness: 100 }]]), 1, 0, 0), [255, 255, 255]),
    ).toBe(true);
    expect(near(hueSaturationRgb(hsv([["Master", { lightness: -100 }]]), 1, 0, 0), [0, 0, 0])).toBe(
      true,
    );
  });

  it("gives everything one hue when colorizing", () => {
    const s = hsv([["Master", { hue: 240, saturation: 100 }]], { colorize: true });
    for (const [r, g, b] of [
      [1, 0, 0],
      [0.5, 0.5, 0.5],
    ] as const) {
      const out = hueSaturationRgb(s, r, g, b);
      expect(out[2]).toBeGreaterThan(out[0]);
    }
  });

  it("adjusts color ranges independently", () => {
    const s = hsv([
      ["Reds", { hue: 60 }],
      ["Blues", { saturation: -100 }],
    ]);
    expect(near(hueSaturationRgb(s, 1, 0, 0), [255, 255, 0])).toBe(true);
    const [r, g, b] = bytes(hueSaturationRgb(s, 0, 0, 1));
    expect(r === g && g === b).toBe(true);
  });

  it("leaves other hues alone, and Invert Range flips the selected band", () => {
    const reds = hsv([["Reds", { lightness: -100 }]], { range: "Reds" });
    expect(near(hueSaturationRgb(reds, 1, 0, 0), [0, 0, 0])).toBe(true);
    expect(near(hueSaturationRgb(reds, 0, 0, 1), [0, 0, 255])).toBe(true);
    const inverted = hsv([["Reds", { lightness: -100 }]], { range: "Reds", invertRange: true });
    expect(near(hueSaturationRgb(inverted, 1, 0, 0), [255, 0, 0])).toBe(true);
    expect(near(hueSaturationRgb(inverted, 0, 0, 1), [0, 0, 0])).toBe(true);
  });

  it("shifts hues inside a band and leaves far-away hues alone", () => {
    const greens = hsv([
      ["Greens", { hue: 60 }],
      ["Master", {}],
    ]);
    expect(near(hueSaturationRgb(greens, 0, 1, 0), [0, 255, 255], 1)).toBe(true); // 120° → 180°.
    expect(near(hueSaturationRgb(greens, 1, 0, 0), [255, 0, 0], 1)).toBe(true);
  });

  it("reads the legacy top-level fields when hsvSettings is absent", () => {
    const legacy = { ...defaultAdjustment("Hue/Saturation", 0), hue: 120 };
    expect(near(hueSaturationRgb(legacy, 1, 0, 0), [0, 255, 0])).toBe(true);
    expect(readBands(legacy).get("Master")).toEqual({ hue: 120, saturation: 0, lightness: 0 });
  });
});

describe("bandWeight", () => {
  it("ramps through the falloff and wraps around 0°", () => {
    const s = defaultAdjustment("Hue/Saturation", 0);
    for (const hue of [0, 345, 15]) expect(bandWeight("Reds", hue, s)).toBe(1);
    expect(bandWeight("Reds", 330, s)).toBeCloseTo(0.5, 3);
    expect(bandWeight("Reds", 30, s)).toBeCloseTo(0.5, 3);
    for (const hue of [315, 45, 180]) expect(bandWeight("Reds", hue, s)).toBe(0);
    expect(bandWeight("Master", 123, s)).toBe(1);
  });

  it("uses a band stored in the file", () => {
    const s = hsv([], {
      bands: [["Greens", { falloffStart: 0, rangeStart: 10, rangeEnd: 20, falloffEnd: 30 }]],
    });
    expect(bandWeight("Greens", 15, s)).toBe(1);
    expect(bandWeight("Greens", 120, s)).toBe(0);
  });
});

describe("adjustedSaturation", () => {
  // HueSaturationTests.swift positiveSaturationMatchesPhotoshop
  it("divides by what is left above 0 and scales toward gray below", () => {
    expect(adjustedSaturation(0.2, 50)).toBeCloseTo(0.4, 9);
    expect(adjustedSaturation(0.3, 62)).toBeCloseTo(0.3 / 0.38, 9);
    expect(adjustedSaturation(0.1, 100)).toBe(1);
    expect(adjustedSaturation(0.8, 50)).toBe(1);
    expect(adjustedSaturation(0, 100)).toBe(0);
    expect(adjustedSaturation(0.6, -50)).toBeCloseTo(0.3, 9);
  });
});

describe("hueSaturationLut", () => {
  const pairs: [string, Adj][] = [
    ["Master", { hue: 20, saturation: 10, lightness: -5 }],
    ["Reds", { hue: -30, saturation: 40 }],
    ["Blues", { lightness: 25 }],
    ["Greens", { hue: 45, saturation: -60, lightness: 10 }],
  ];
  const bands: [string, Band][] = [
    ["Reds", { falloffStart: 300, rangeStart: 340, rangeEnd: 20, falloffEnd: 60 }],
    ["Blues", { falloffStart: 190, rangeStart: 220, rangeEnd: 260, falloffEnd: 300 }],
  ];

  it("does not depend on the order of the interleaved arrays", () => {
    const a = hueSaturationLut(hsv(pairs, { bands }));
    const b = hueSaturationLut(hsv(pairs.toReversed(), { bands: bands.toReversed() }));
    expect(b).toEqual(a);
  });

  it("is the identity for the defaults", () => {
    const lut = hueSaturationLut(defaultAdjustment("Hue/Saturation", 0));
    for (let i = 0; i < lut.length; i += 4) {
      const p = i / 4;
      const want = [p % 33, Math.floor(p / 33) % 33, Math.floor(p / 1089)].map((v) => v / 32);
      for (let c = 0; c < 3; c++)
        expect(Math.abs((lut[i + c] ?? 0) - (want[c] ?? 0))).toBeLessThan(1e-6);
    }
  });

  // Within a sector a pure hue rotation is linear in RGB, so the cube holds 2/255. Saturation and
  // lightness bend HSL's chroma at L = 0.5; there the 33³ cube is off by up to ~9/255, which is why
  // HueSaturationTests.swift allows 8 levels.
  it.each([
    [{ hue: 30 }, 2],
    [{ hue: 30, saturation: -20, lightness: 10 }, 8],
  ] as const)("interpolates %o within %i/255 of the exact function", (adj, levels) => {
    const s = hsv([["Master", adj]]);
    const lut = hueSaturationLut(s);
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 100; n++) {
      const [r, g, b] = [rand(), rand(), rand()];
      const got = sampleLut3d(lut, r, g, b);
      const want = hueSaturationRgb(s, r, g, b);
      for (let c = 0; c < 3; c++)
        expect(Math.abs((got[c] ?? 0) - (want[c] ?? 0))).toBeLessThanOrEqual(levels / 255);
    }
  });
});
