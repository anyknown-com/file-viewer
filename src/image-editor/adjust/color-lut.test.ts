import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AdjustmentSettings } from "../api";
import {
  blackWhiteRgb,
  colorBalanceRgb,
  gradientMapRgb,
  invertLut,
  blackWhiteLut,
  colorBalanceLut,
  gradientMapLut,
} from "./color-lut";
import { LUT3D_SIZE } from "./lut3d";
import { defaultAdjustment } from "./settings";

type Case =
  | {
      kind: "gradientMap";
      settings: NonNullable<AdjustmentSettings["gradientMapSettings"]>;
      out: number[];
    }
  | {
      kind: "blackWhite";
      settings: NonNullable<AdjustmentSettings["blackWhiteSettings"]>;
      out: number[];
    }
  | {
      kind: "colorBalance";
      settings: NonNullable<AdjustmentSettings["colorBalanceSettings"]>;
      out: number[];
    };

const fixtures = JSON.parse(
  readFileSync("src/image-editor/adjust/__fixtures__/color.json", "utf8"),
) as { cases: Case[] };

function settingsOf(c: Case): AdjustmentSettings {
  switch (c.kind) {
    case "gradientMap":
      return { ...defaultAdjustment("Gradient Map", 0), gradientMapSettings: c.settings };
    case "blackWhite":
      return { ...defaultAdjustment("Black & White", 0), blackWhiteSettings: c.settings };
    case "colorBalance":
      return { ...defaultAdjustment("Color Balance", 0), colorBalanceSettings: c.settings };
  }
}

const RGB = {
  gradientMap: gradientMapRgb,
  blackWhite: blackWhiteRgb,
  colorBalance: colorBalanceRgb,
};

describe("color adjustments", () => {
  it("match Compositor's C kernels within 1 for every fixture case", () => {
    expect(fixtures.cases.map((c) => c.kind)).toEqual([
      "gradientMap",
      "gradientMap",
      "blackWhite",
      "blackWhite",
      "colorBalance",
      "colorBalance",
    ]);
    for (const c of fixtures.cases) {
      const s = settingsOf(c);
      for (let i = 0; i < 512; i++) {
        const input = [(i * 37) % 256, (i * 91) % 256, (i * 173) % 256].map((v) => v / 255);
        const out = RGB[c.kind](s, input[0] ?? 0, input[1] ?? 0, input[2] ?? 0);
        for (let ch = 0; ch < 3; ch++) {
          const got = Math.round((out[ch] ?? 0) * 255);
          expect(
            Math.abs(got - (c.out[i * 3 + ch] ?? -1)),
            `${c.kind} #${i} ch ${ch}`,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  // ImageAdjustments.swift: pure red at the default 40% comes out 40% gray.
  it("turns pure red into 40% gray with the default Black & White", () => {
    const [r, g, b] = blackWhiteRgb(defaultAdjustment("Black & White", 0), 1, 0, 0);
    expect([r, g, b]).toEqual([0.4, 0.4, 0.4].map((v) => expect.closeTo(v, 6)));
  });

  it("leaves colors alone with an unset or all-zero Color Balance", () => {
    const unset = defaultAdjustment("Color Balance", 0);
    expect(colorBalanceRgb(unset, 0.2, 0.5, 0.9)).toEqual([0.2, 0.5, 0.9]);
  });

  it("maps black to the shadow color and white to the highlight color", () => {
    const s: AdjustmentSettings = {
      ...defaultAdjustment("Gradient Map", 0),
      gradientMapSettings: {
        shadows: { red: 0.2, green: 0, blue: 0.4 },
        highlights: { red: 1, green: 0.8, blue: 0 },
        reversed: false,
      },
    };
    expect(gradientMapRgb(s, 0, 0, 0).map((v) => Math.round(v * 255))).toEqual([51, 0, 102]);
    expect(gradientMapRgb(s, 1, 1, 1).map((v) => Math.round(v * 255))).toEqual([255, 204, 0]);
  });

  it("bakes every per-point function into a 33³ cube with A = 1", () => {
    const n = LUT3D_SIZE ** 3 * 4;
    for (const lut of [
      gradientMapLut(defaultAdjustment("Gradient Map", 0)),
      blackWhiteLut(defaultAdjustment("Black & White", 0)),
      colorBalanceLut(defaultAdjustment("Color Balance", 0)),
    ]) {
      expect(lut).toHaveLength(n);
      expect(lut[n - 1]).toBe(1);
    }
  });

  it("inverts the eight corners of the cube", () => {
    const lut = invertLut(defaultAdjustment("Invert", 0));
    const last = LUT3D_SIZE - 1;
    for (let corner = 0; corner < 8; corner++) {
      const [r, g, b] = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
      const at = ((b * last * LUT3D_SIZE + g * last) * LUT3D_SIZE + r * last) * 4;
      expect(Array.from(lut.subarray(at, at + 4))).toEqual([1 - r, 1 - g, 1 - b, 1]);
    }
  });
});
