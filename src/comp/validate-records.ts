// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerTransform.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// The `isValid` checks validateLikeCompositor calls, one function per Swift type. Also
// Compositor/Document/TypeTool.swift, LayerAdjustment.swift, Levels.swift, Curves.swift,
// HueSaturation.swift, ImageAdjustments.swift and DocumentLimits.swift. Each returns one reason per
// failed condition, as "<field> <reason>"; an empty array means valid.
import type { LayerAdjustment } from "./manifest-adjust";
import type { LayerTransform } from "./manifest-layer";
import type { LayerTextStyle } from "./manifest-text-shape";

// DocumentLimits.swift `maxSide` and `maxSurfacePixels`.
export const MAX_SIDE = 30_000;
const MAX_SURFACE_PIXELS = 200_000_000;

/** Swift `isFinite && (lo...hi).contains(n)`. */
export function within(n: unknown, lo: number, hi: number): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
}

/** Pushes "<field> must be in lo…hi" when `n` is outside the closed range. */
export function checkRange(out: string[], field: string, n: unknown, lo: number, hi: number): void {
  if (!within(n, lo, hi)) out.push(`${field} must be in ${lo}…${hi}`);
}

// LayerTransform.swift `LayerTransform.isValid`.
export function transformProblems(t: LayerTransform, field: string): string[] {
  const out: string[] = [];
  if (!within(t.size[0], 1, 300_000) || !within(t.size[1], 1, 300_000)) {
    out.push(`${field}.size must be in 1…300000 on each side`);
  }
  if (!within(t.origin[0], -1_000_000, 1_000_000) || !within(t.origin[1], -1_000_000, 1_000_000)) {
    out.push(`${field}.origin must be in -1000000…1000000 on each axis`);
  }
  if (!Number.isFinite(t.rotation)) out.push(`${field}.rotation must be finite`);
  return out;
}

// Swift `Character.isNewline`.
const NEWLINE = /[\n\v\f\r\u0085\u2028\u2029]/;

// Swift `String.count` counts grapheme clusters.
function graphemes(s: string): number {
  let n = 0;
  for (const _ of new Intl.Segmenter().segment(s)) n++;
  return n;
}

type Run = { location: number; length: number };

// TypeTool.swift `colorRunsAreValid` / `fontRunsAreValid`: sorted, not overlapping, non-empty,
// inside the content. Returns the first reason, as the Swift loop stops at the first failure.
function runsProblem<R extends Run>(
  runs: R[],
  field: string,
  contentLength: number,
  item: (run: R) => string | undefined,
): string | undefined {
  let end = 0;
  for (const [i, run] of runs.entries()) {
    if (run.location < end) return `${field}[${i}] overlaps the run before it or is out of order`;
    if (run.length <= 0) return `${field}[${i}].length must be greater than 0`;
    const problem = item(run);
    if (problem) return `${field}[${i}]${problem}`;
    end = run.location + run.length;
  }
  if (runs.length === 0) return `${field} must not be empty`;
  if (end > contentLength) return `${field} runs past the end of content`;
  return undefined;
}

// TypeTool.swift `LayerTextStyle.isValid` and `boxIsValid`.
export function textProblems(text: LayerTextStyle): string[] {
  const out: string[] = [];
  // String.utf16.count; a JS string's length is its UTF-16 length.
  const length = text.content.length;
  if (length > 100_000) out.push("text.content is longer than 100000 UTF-16 units");
  if (text.boxSize) {
    const [w, h] = text.boxSize;
    if (!within(w, 16, MAX_SIDE) || !within(h, 16, MAX_SIDE) || w * h > MAX_SURFACE_PIXELS) {
      out.push(
        `text.boxSize must be 16…${MAX_SIDE} per side and at most ${MAX_SURFACE_PIXELS} px²`,
      );
    }
  }
  checkRange(out, "text.fontSize", text.fontSize, 1, 2000);
  checkRange(out, "text.red", text.red, 0, 1);
  checkRange(out, "text.green", text.green, 0, 1);
  checkRange(out, "text.blue", text.blue, 0, 1);
  checkRange(out, "text.tracking", text.tracking, -100, 1000);
  checkRange(out, "text.leading", text.leading, 0, 5000);
  const colors =
    text.colorRuns &&
    runsProblem(text.colorRuns, "text.colorRuns", length, (run) =>
      [run.red, run.green, run.blue].every((c) => within(c, 0, 1))
        ? undefined
        : " color must be in 0…1",
    );
  if (colors) out.push(colors);
  const fonts =
    text.fontRuns &&
    runsProblem(text.fontRuns, "text.fontRuns", length, (run) =>
      run.fontName.length === 0 || graphemes(run.fontName) > 200 || NEWLINE.test(run.fontName)
        ? ".fontName must be 1…200 characters without a line break"
        : undefined,
    );
  if (fonts) out.push(fonts);
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// HueSaturation.swift: `adjustments` and `bands` are `[ColorRange: V]`, encoded as an array that
// alternates key and value; the values sit at odd indexes. LayerAdjustment.isValid checks every
// RangeAdjustment's hue / saturation / lightness and every HueBand's four handles.
function hsvProblems(a: LayerAdjustment, out: string[]): void {
  const hsv = a.hsvSettings;
  if (!hsv) return; // resolvedHSV is then built from hue / saturation / lightness, checked above
  for (let i = 1; i < hsv.adjustments.length; i += 2) {
    const v = hsv.adjustments[i];
    const field = `adjustment.hsvSettings.adjustments[${i}]`;
    if (!isObject(v)) continue; // the schema already requires an object here
    checkRange(out, `${field}.hue`, v.hue, -360, 360);
    checkRange(out, `${field}.saturation`, v.saturation, -100, 100);
    checkRange(out, `${field}.lightness`, v.lightness, -100, 100);
  }
  for (let i = 1; i < hsv.bands.length; i += 2) {
    const v = hsv.bands[i];
    if (!isObject(v)) continue;
    const handles = [v.falloffStart, v.rangeStart, v.rangeEnd, v.falloffEnd];
    if (!handles.every((h) => typeof h === "number" && Number.isFinite(h))) {
      out.push(`adjustment.hsvSettings.bands[${i}] handles must be finite numbers`);
    }
  }
}

// Levels.swift `LevelRange.normalized`: a range is valid when normalizing leaves it unchanged.
function levelRangeIsNormal(r: LayerAdjustment["levels"]["ranges"][number]): boolean {
  return (
    within(r.black, 0, 254) &&
    within(r.white, r.black + 1, 255) &&
    within(r.gamma, 0.1, 9.99) &&
    within(r.outputBlack, 0, 255) &&
    within(r.outputWhite, 0, 255)
  );
}

// Curves.swift `CurvesSettings.isValid`, first reason per channel.
function curveProblem(points: LayerAdjustment["curves"]["channels"][number]): string | undefined {
  if (points.length < 2 || points.length > 32) return "must have 2…32 points";
  if (points[0]?.x !== 0 || points[points.length - 1]?.x !== 255) {
    return "must start at x 0 and end at x 255";
  }
  if (!points.every((p) => within(p.x, 0, 255) && within(p.y, 0, 255))) {
    return "points must be in 0…255";
  }
  for (let i = 1; i < points.length; i++) {
    if (!((points[i - 1]?.x ?? 0) < (points[i]?.x ?? 0))) return "x must strictly increase";
  }
  return undefined;
}

// ImageAdjustments.swift: the `isValid` of each settings struct a LayerAdjustment carries.
function imageAdjustmentProblems(a: LayerAdjustment, out: string[]): void {
  const ex = a.exposureSettings;
  if (ex) {
    checkRange(out, "adjustment.exposureSettings.exposure", ex.exposure, -20, 20);
    checkRange(out, "adjustment.exposureSettings.offset", ex.offset, -0.5, 0.5);
    checkRange(out, "adjustment.exposureSettings.gamma", ex.gamma, 0.01, 9.99);
  }
  const gm = a.gradientMapSettings;
  if (gm) {
    for (const end of ["shadows", "highlights"] as const) {
      const c = gm[end];
      if (![c.red, c.green, c.blue].every((v) => within(v, 0, 1))) {
        out.push(`adjustment.gradientMapSettings.${end} must be in 0…1 per channel`);
      }
    }
  }
  const gr = a.grainSettings;
  if (gr) {
    checkRange(out, "adjustment.grainSettings.amount", gr.amount, 0, 100);
    checkRange(out, "adjustment.grainSettings.size", gr.size, 0.5, 20);
    checkRange(out, "adjustment.grainSettings.roughness", gr.roughness, 0, 100);
  }
  const bw = a.blackWhiteSettings;
  if (bw) {
    for (const key of ["reds", "yellows", "greens", "cyans", "blues", "magentas"] as const) {
      checkRange(out, `adjustment.blackWhiteSettings.${key}`, bw[key], -200, 300);
    }
    checkRange(out, "adjustment.blackWhiteSettings.tintHue", bw.tintHue, 0, 360);
    checkRange(out, "adjustment.blackWhiteSettings.tintSaturation", bw.tintSaturation, 0, 100);
  }
  const cb = a.colorBalanceSettings;
  if (cb) {
    for (const tone of ["shadow", "mid", "highlight"] as const) {
      for (const axis of ["CyanRed", "MagentaGreen", "YellowBlue"] as const) {
        const key = `${tone}${axis}` as const;
        checkRange(out, `adjustment.colorBalanceSettings.${key}`, cb[key], -100, 100);
      }
    }
  }
}

// LayerAdjustment.swift `LayerAdjustment.isValid`, with the `isValid` of every settings struct
// it reaches (ImageAdjustments.swift). Absent optional settings resolve to their defaults, which
// are valid, so only present ones are checked.
export function adjustmentProblems(a: LayerAdjustment): string[] {
  const out: string[] = [];
  checkRange(out, "adjustment.hue", a.hue, -360, 360);
  checkRange(out, "adjustment.saturation", a.saturation, -100, 100);
  checkRange(out, "adjustment.lightness", a.lightness, -100, 100);
  hsvProblems(a, out);
  if (a.levels.ranges.length !== 4) out.push("adjustment.levels.ranges must have 4 entries");
  a.levels.ranges.forEach((r, i) => {
    if (!levelRangeIsNormal(r)) {
      out.push(
        `adjustment.levels.ranges[${i}] must have black 0…254, white black+1…255, gamma 0.1…9.99, outputs 0…255`,
      );
    }
  });
  if (a.curves.channels.length !== 4) out.push("adjustment.curves.channels must have 4 entries");
  a.curves.channels.forEach((points, i) => {
    const problem = curveProblem(points);
    if (problem) out.push(`adjustment.curves.channels[${i}] ${problem}`);
  });
  imageAdjustmentProblems(a, out);
  // gaussianRadius, resolvedMotionAngle, resolvedMotionDistance, resolvedNoiseAmount: nil means
  // the default (10, 0, 10, 10), which is in range.
  if (a.blurRadius !== undefined) checkRange(out, "adjustment.blurRadius", a.blurRadius, 0.1, 250);
  if (a.motionAngle !== undefined)
    checkRange(out, "adjustment.motionAngle", a.motionAngle, -90, 90);
  if (a.motionDistance !== undefined) {
    checkRange(out, "adjustment.motionDistance", a.motionDistance, 1, 2000);
  }
  if (a.noiseAmount !== undefined)
    checkRange(out, "adjustment.noiseAmount", a.noiseAmount, 0.1, 400);
  return out;
}
