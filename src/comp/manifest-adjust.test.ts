// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toJsonValue } from "./extra";
import { layerAdjustmentSchema } from "./manifest-adjust";

const identityRange = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };

// The Curves example's `adjustment` object from Compositor docs/writing-comp-files.md @11d8d7a.
function curvesExample(): Record<string, unknown> {
  return {
    kind: "Curves",
    hue: 0,
    saturation: 0,
    lightness: 0,
    colorize: false,
    levels: {
      channel: "RGB",
      ranges: [identityRange, identityRange, identityRange, identityRange],
    },
    curves: {
      channel: "RGB",
      channels: [
        [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        [
          { x: 0, y: 0 },
          { x: 120, y: 147 },
          { x: 255, y: 255 },
        ],
        [
          { x: 0, y: 0 },
          { x: 100, y: 114 },
          { x: 255, y: 255 },
        ],
        [
          { x: 0, y: 0 },
          { x: 115, y: 97 },
          { x: 255, y: 238 },
        ],
      ],
    },
  };
}

function hsvExample(): Record<string, unknown> {
  return {
    ...curvesExample(),
    kind: "Hue/Saturation",
    hsvSettings: {
      range: "Reds",
      colorize: false,
      invertRange: false,
      adjustments: [
        "Master",
        { hue: 10, saturation: 0, lightness: 0 },
        "Reds",
        { hue: -20, saturation: 15, lightness: 5 },
      ],
      bands: ["Reds", { falloffStart: 315, rangeStart: 345, rangeEnd: 15, falloffEnd: 45 }],
    },
  };
}

function issuePaths(input: unknown): string[] {
  const result = layerAdjustmentSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.error?.issues.map((i) => i.path.join(".")) ?? [];
}

describe("layerAdjustmentSchema", () => {
  it("accepts the Curves example", () => {
    const parsed = layerAdjustmentSchema.parse(curvesExample());
    expect(parsed.kind).toBe("Curves");
    expect(parsed.extra).toBeUndefined();
    expect(toJsonValue(parsed)).toEqual(curvesExample());
  });

  it("requires fields that have a Swift default value", () => {
    const { hue: _hue, ...noHue } = curvesExample();
    expect(issuePaths(noHue)).toContain("hue");
  });

  it("treats Swift optionals as optional", () => {
    const input = { ...curvesExample(), blurRadius: 12 };
    const { blurRadius: _blur, ...noBlur } = input;
    expect(layerAdjustmentSchema.safeParse(input).success).toBe(true);
    expect(layerAdjustmentSchema.safeParse(noBlur).success).toBe(true);
  });

  it("keeps unknown keys in extra and writes them back in place", () => {
    const input = curvesExample();
    input.futureKey = 1;
    const levels = input.levels as Record<string, unknown>;
    levels.x = true;
    const parsed = layerAdjustmentSchema.parse(input);
    expect(parsed.extra).toEqual({ futureKey: 1 });
    expect(parsed.levels.extra).toEqual({ x: true });
    expect("futureKey" in parsed).toBe(false);
    expect("x" in parsed.levels).toBe(false);
    expect(toJsonValue(parsed)).toEqual(input);
  });

  it("sorts keys and drops undefined in toJsonValue", () => {
    const out = toJsonValue({ b: 1, a: { d: undefined, c: [{ z: 1, y: 2 }] }, extra: { aa: 3 } });
    expect(JSON.stringify(out)).toBe('{"a":{"c":[{"y":2,"z":1}]},"aa":3,"b":1}');
  });

  it("round-trips Hue/Saturation dictionaries as alternating arrays, in order", () => {
    const parsed = layerAdjustmentSchema.parse(hsvExample());
    expect(parsed.hsvSettings?.adjustments).toEqual(
      (hsvExample().hsvSettings as Record<string, unknown>).adjustments,
    );
    expect(toJsonValue(parsed)).toEqual(hsvExample());
  });

  it("rejects malformed alternating arrays", () => {
    const input = hsvExample();
    const hsv = input.hsvSettings as Record<string, unknown>;
    hsv.adjustments = ["Master", { hue: 0, saturation: 0, lightness: 0 }, "Reds"];
    expect(issuePaths(input)).toContain("hsvSettings.adjustments");
    hsv.adjustments = [{ hue: 0 }, "Master"];
    expect(issuePaths(input)).toEqual(["hsvSettings.adjustments.0", "hsvSettings.adjustments.1"]);
  });

  it("requires every Hue/Saturation settings field", () => {
    const input = hsvExample();
    delete (input.hsvSettings as Record<string, unknown>).bands;
    expect(issuePaths(input)).toContain("hsvSettings.bands");
  });

  it.each([-1, 4294967296, 1.5])("rejects noiseSeed %s as a UInt32", (noiseSeed) => {
    expect(issuePaths({ ...curvesExample(), noiseSeed })).toContain("noiseSeed");
  });

  it("accepts the UInt32 bounds for noiseSeed", () => {
    for (const noiseSeed of [0, 4294967295]) {
      expect(layerAdjustmentSchema.safeParse({ ...curvesExample(), noiseSeed }).success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    expect(issuePaths({ ...curvesExample(), kind: "Sharpen" })).toContain("kind");
  });

  it("checks nested image adjustment settings", () => {
    const grainSettings = { amount: 25, size: 1.5, roughness: 50, seed: 7 };
    const colorBalanceSettings = {
      shadowCyanRed: 0,
      shadowMagentaGreen: 0,
      shadowYellowBlue: 0,
      midCyanRed: 10,
      midMagentaGreen: 0,
      midYellowBlue: -10,
      highlightCyanRed: 0,
      highlightMagentaGreen: 0,
      highlightYellowBlue: 0,
      preserveLuminosity: true,
    };
    const gradientMapSettings = {
      shadows: { red: 0, green: 0, blue: 0 },
      highlights: { red: 1, green: 1, blue: 1 },
      reversed: false,
    };
    const ok = { ...curvesExample(), grainSettings, colorBalanceSettings, gradientMapSettings };
    expect(toJsonValue(layerAdjustmentSchema.parse(ok))).toEqual(ok);
    const { preserveLuminosity: _p, ...noPreserve } = colorBalanceSettings;
    expect(issuePaths({ ...ok, colorBalanceSettings: noPreserve })).toContain(
      "colorBalanceSettings.preserveLuminosity",
    );
    expect(issuePaths({ ...ok, grainSettings: { ...grainSettings, seed: -1 } })).toContain(
      "grainSettings.seed",
    );
  });
});
