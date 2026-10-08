// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";
import { validateLikeCompositor } from "./validate";

type Json = Record<string, unknown>;

const ID = "6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F";
const ID8 = ID.slice(0, 8);

// The minimal manifest from Compositor docs/writing-comp-files.md @11d8d7a, its one layer changed
// by `extra` and the manifest by `top`.
function run(extra: Json, top: Json = {}): string[] {
  const layer = {
    id: ID,
    name: "Background",
    imageFile: `${ID}.png`,
    isVisible: true,
    isGroup: false,
    opacity: 1,
    blendMode: "Normal",
    transform: {
      origin: [0, 0],
      size: [1920, 1080],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "High quality",
    },
    ...extra,
  };
  const m = {
    format: "com.compositor.project",
    version: 11,
    colorSpace: "sRGB",
    documentID: "0C5E7A91-3B2D-4F6A-8E1C-9D0B7A6F5E4D",
    width: 1920,
    height: 1080,
    resolution: 72,
    activeLayerID: ID,
    layers: [layer],
    ...top,
  };
  return validateLikeCompositor(parseManifest(new TextEncoder().encode(JSON.stringify(m))));
}

/** The only message, which must name the layer. */
function one(problems: string[]): string {
  expect(problems).toHaveLength(1);
  const [problem = ""] = problems;
  expect(problem).toContain(ID8);
  return problem;
}

const textStyle = (extra: Json = {}): Json => ({
  content: "Hello",
  fontName: "Helvetica",
  fontSize: 72,
  red: 0,
  green: 0,
  blue: 0,
  alignment: "Left",
  tracking: 0,
  leading: 0,
  ...extra,
});
const text = (extra: Json = {}, top: Json = {}): string[] => run({ text: textStyle(extra) }, top);

const colorRun = (location: number, length: number, red = 0): Json => ({
  location,
  length,
  red,
  green: 0,
  blue: 0,
});
const fontRun = (fontName: string): Json => ({ location: 0, length: 1, fontName });

describe("text layers (LayerTextStyle.isValid)", () => {
  it("accepts a full text style", () => {
    const runs = {
      boxSize: [400, 200],
      colorRuns: [{ location: 0, length: 2, red: 1, green: 0, blue: 0 }],
      fontRuns: [{ location: 2, length: 3, fontName: "Helvetica-Bold" }],
    };
    expect(text(runs)).toEqual([]);
  });

  it("checks sizes, colors and spacing", () => {
    expect(one(text({ content: "a".repeat(100_001) }))).toContain("text.content");
    expect(one(text({ boxSize: [15, 200] }))).toContain("text.boxSize");
    expect(one(text({ boxSize: [20_000, 20_000] }))).toContain("text.boxSize");
    expect(one(text({ fontSize: 0 }))).toContain("text.fontSize");
    expect(one(text({ fontSize: 2001 }))).toContain("text.fontSize");
    expect(one(text({ red: 1.5 }))).toContain("text.red");
    expect(one(text({ tracking: -101 }))).toContain("text.tracking");
    expect(one(text({ leading: 5001 }))).toContain("text.leading");
  });

  it("checks runs", () => {
    expect(one(text({ colorRuns: [colorRun(0, 3), colorRun(2, 2)] }))).toContain(
      "text.colorRuns[1]",
    );
    expect(one(text({ colorRuns: [colorRun(0, 0)] }))).toContain("text.colorRuns[0].length");
    expect(one(text({ colorRuns: [colorRun(0, 2, 2)] }))).toContain("text.colorRuns[0]");
    expect(one(text({ colorRuns: [] }))).toContain("text.colorRuns");
    expect(one(text({ colorRuns: [colorRun(3, 3)] }))).toContain("text.colorRuns");
    expect(one(text({ fontRuns: [fontRun("")] }))).toContain("text.fontRuns[0].fontName");
    expect(one(text({ fontRuns: [fontRun("A\nB")] }))).toContain("text.fontRuns[0].fontName");
    expect(one(text({ fontRuns: [fontRun("x".repeat(201))] }))).toContain(
      "text.fontRuns[0].fontName",
    );
  });

  it("checks run versions", () => {
    const colorRuns = [{ location: 0, length: 1, red: 0, green: 0, blue: 0 }];
    expect(one(text({ colorRuns }, { version: 9 }))).toContain("text.colorRuns");
    expect(
      one(text({ fontRuns: [{ location: 0, length: 1, fontName: "Menlo" }] }, { version: 10 })),
    ).toContain("text.fontRuns");
  });

  it("needs a raster on a plain layer", () => {
    expect(one(run({ text: textStyle(), imageFile: undefined }))).toContain("text");
    // A folder never has an image, so a text folder also lacks one: two reasons.
    const onFolder = run({ text: textStyle(), isGroup: true, imageFile: undefined });
    expect(onFolder).toHaveLength(2);
    expect(onFolder.some((p) => p.includes("folder"))).toBe(true);
  });
});

const identityRange = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };
const identityCurve = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];
const adjustment = (extra: Json = {}): Json => ({
  kind: "Levels",
  hue: 0,
  saturation: 0,
  lightness: 0,
  colorize: false,
  levels: { channel: "RGB", ranges: [identityRange, identityRange, identityRange, identityRange] },
  curves: {
    channel: "RGB",
    channels: [identityCurve, identityCurve, identityCurve, identityCurve],
  },
  ...extra,
});
const adjust = (extra: Json = {}, top: Json = {}): string[] =>
  run({ adjustment: adjustment(extra), imageFile: undefined }, top);
const levels = (ranges: Json[]): Json => ({ levels: { channel: "RGB", ranges } });
const curves = (channels: Json[][]): Json => ({ curves: { channel: "RGB", channels } });
const band = { falloffStart: 315, rangeStart: 345, rangeEnd: 15, falloffEnd: 45 };
const hsv = (adjustments: unknown[], bands: unknown[] = ["Reds", band]): Json => ({
  hsvSettings: { range: "Master", colorize: false, invertRange: false, adjustments, bands },
});

describe("adjustment layers (LayerAdjustment.isValid)", () => {
  it("accepts every settings block at its defaults", () => {
    const all = {
      ...hsv(["Master", { hue: 10, saturation: 0, lightness: 0 }]),
      exposureSettings: { exposure: 0, offset: 0, gamma: 1 },
      gradientMapSettings: {
        shadows: { red: 0, green: 0, blue: 0 },
        highlights: { red: 1, green: 1, blue: 1 },
        reversed: false,
      },
      grainSettings: { amount: 25, size: 1.5, roughness: 50, seed: 7 },
      blurRadius: 10,
      motionAngle: 0,
      motionDistance: 10,
      noiseAmount: 10,
    };
    expect(adjust(all)).toEqual([]);
  });

  it("checks layer and version rules", () => {
    expect(one(adjust({}, { version: 6 }))).toContain("adjustment");
    expect(one(run({ adjustment: adjustment() }))).toContain("imageFile");
    expect(one(run({ adjustment: adjustment(), isGroup: true, imageFile: undefined }))).toContain(
      "folder",
    );
    expect(one(adjust({ kind: "Gaussian Blur" }, { version: 8 }))).toContain("Gaussian Blur");
    expect(adjust({ kind: "Add Noise" }, { version: 9 })).toEqual([]);
  });

  it("checks hue, saturation and lightness", () => {
    expect(one(adjust({ hue: 361 }))).toContain("adjustment.hue");
    expect(one(adjust({ saturation: -101 }))).toContain("adjustment.saturation");
    expect(one(adjust(hsv(["Reds", { hue: 400, saturation: 0, lightness: 0 }])))).toContain(
      "adjustments[1].hue",
    );
    expect(one(adjust(hsv([], ["Reds", { ...band, rangeEnd: "x" }])))).toContain("bands[1]");
  });

  it("rejects color ranges Compositor cannot decode", () => {
    const rangeValue = { hue: 0, saturation: 0, lightness: 0 };
    expect(one(adjust(hsv(["Oranges", rangeValue])))).toContain("adjustments[0] must be one of");
    expect(one(adjust(hsv([], ["reds", band])))).toContain("bands[0] must be one of");
  });

  it("checks levels and curves", () => {
    expect(one(adjust(levels([identityRange, identityRange, identityRange])))).toContain(
      "adjustment.levels.ranges",
    );
    const crossed = { ...identityRange, black: 200, white: 150 };
    expect(one(adjust(levels([crossed, identityRange, identityRange, identityRange])))).toContain(
      "ranges[0]",
    );
    const gamma = { ...identityRange, gamma: 10 };
    expect(one(adjust(levels([identityRange, gamma, identityRange, identityRange])))).toContain(
      "ranges[1]",
    );
    expect(one(adjust(curves([identityCurve, identityCurve, identityCurve])))).toContain(
      "adjustment.curves.channels",
    );
    const shifted = [{ x: 1, y: 0 }, identityCurve[1]!];
    expect(one(adjust(curves([shifted, identityCurve, identityCurve, identityCurve])))).toContain(
      "channels[0]",
    );
    const backwards = [
      { x: 0, y: 0 },
      { x: 200, y: 9 },
      { x: 100, y: 9 },
      { x: 255, y: 255 },
    ];
    expect(one(adjust(curves([identityCurve, backwards, identityCurve, identityCurve])))).toContain(
      "channels[1]",
    );
    const crowded = Array.from({ length: 33 }, (_, i) => ({ x: i === 32 ? 255 : i, y: 0 }));
    expect(one(adjust(curves([identityCurve, identityCurve, crowded, identityCurve])))).toContain(
      "channels[2]",
    );
  });

  it("checks the image adjustment settings", () => {
    expect(one(adjust({ exposureSettings: { exposure: 21, offset: 0, gamma: 1 } }))).toContain(
      "exposureSettings.exposure",
    );
    expect(one(adjust({ exposureSettings: { exposure: 0, offset: 0.6, gamma: 1 } }))).toContain(
      "exposureSettings.offset",
    );
    const color = { red: 2, green: 0, blue: 0 };
    const gradient = { shadows: color, highlights: { red: 1, green: 1, blue: 1 }, reversed: false };
    expect(one(adjust({ gradientMapSettings: gradient }))).toContain("gradientMapSettings.shadows");
    expect(
      one(adjust({ grainSettings: { amount: 25, size: 0.4, roughness: 50, seed: 0 } })),
    ).toContain("grainSettings.size");
    const bw = {
      reds: 301,
      yellows: 60,
      greens: 40,
      cyans: 60,
      blues: 20,
      magentas: 80,
      tint: false,
      tintHue: 40,
      tintSaturation: 20,
    };
    expect(one(adjust({ blackWhiteSettings: bw }))).toContain("blackWhiteSettings.reds");
    expect(one(adjust({ blackWhiteSettings: { ...bw, reds: 40, tintHue: 361 } }))).toContain(
      "tintHue",
    );
    const balance = {
      shadowCyanRed: 0,
      shadowMagentaGreen: 0,
      shadowYellowBlue: 0,
      midCyanRed: 101,
      midMagentaGreen: 0,
      midYellowBlue: 0,
      highlightCyanRed: 0,
      highlightMagentaGreen: 0,
      highlightYellowBlue: 0,
      preserveLuminosity: true,
    };
    expect(one(adjust({ colorBalanceSettings: balance }))).toContain(
      "colorBalanceSettings.midCyanRed",
    );
  });

  it("checks blur and noise parameters", () => {
    expect(one(adjust({ blurRadius: 0 }))).toContain("blurRadius");
    expect(one(adjust({ motionAngle: 91 }))).toContain("motionAngle");
    expect(one(adjust({ motionDistance: 0 }))).toContain("motionDistance");
    expect(one(adjust({ noiseAmount: 401 }))).toContain("noiseAmount");
  });
});
