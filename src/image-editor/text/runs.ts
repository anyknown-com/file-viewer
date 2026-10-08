// Run rules follow Compositor (github.com/robbietilton/Compositor @11d8d7a,
// Compositor/Document/TypeTool.swift): sorted, no overlap, length > 0, inside the content; adjacent
// runs with the same value are merged. Positions are UTF-16 code units, like JS strings.
import type { LayerTextStyle } from "../../comp/index";
import { type ColorRun, type FontRun, MAX_CONTENT } from "./style";

type Span = { location: number; length: number };
type Rgb = [number, number, number];

export function normalizeRuns<R extends Span>(
  runs: readonly R[],
  contentLength: number,
  same: (a: R, b: R) => boolean,
): R[] {
  const clipped = runs
    .map((r) => {
      const start = Math.max(0, r.location);
      const end = Math.min(contentLength, r.location + r.length);
      return { ...r, location: start, length: end - start };
    })
    .filter((r) => r.length > 0)
    .toSorted((a, b) => a.location - b.location);
  const out: R[] = [];
  for (const r of clipped) {
    const prev = out.at(-1);
    const prevEnd = prev ? prev.location + prev.length : 0;
    const start = Math.max(r.location, prevEnd);
    const end = r.location + r.length;
    if (end <= start) continue;
    if (prev && prevEnd === start && same(prev, r)) {
      prev.length = end - prev.location;
    } else {
      out.push({ ...r, location: start, length: end - start });
    }
  }
  return out;
}

const sameColor = (a: ColorRun, b: ColorRun) =>
  a.red === b.red && a.green === b.green && a.blue === b.blue;
const sameFont = (a: FontRun, b: FontRun) => a.fontName === b.fontName;

/** Removes [start, end) from the runs, splitting runs that cross either edge. */
function cut<R extends Span>(runs: readonly R[], start: number, end: number): R[] {
  const out: R[] = [];
  for (const r of runs) {
    const a = r.location;
    const b = r.location + r.length;
    if (b <= start || a >= end) {
      out.push(r);
      continue;
    }
    if (a < start) out.push({ ...r, length: start - a });
    if (b > end) out.push({ ...r, location: end, length: b - end });
  }
  return out;
}

function withRuns(
  s: LayerTextStyle,
  colorRuns: ColorRun[] | undefined,
  fontRuns: FontRun[] | undefined,
): LayerTextStyle {
  const next: LayerTextStyle = { ...s, colorRuns, fontRuns };
  if (!colorRuns?.length) delete next.colorRuns;
  if (!fontRuns?.length) delete next.fontRuns;
  return next;
}

/** Colors [start, end); with start === end, recolors the whole text and clears the color runs. */
export function applyColor(
  s: LayerTextStyle,
  start: number,
  end: number,
  rgb: Rgb,
): LayerTextStyle {
  const [red, green, blue] = rgb;
  if (start === end) return withRuns({ ...s, red, green, blue }, undefined, s.fontRuns);
  const run: ColorRun = { location: start, length: end - start, red, green, blue };
  const runs = normalizeRuns(
    [...cut(s.colorRuns ?? [], start, end), run],
    s.content.length,
    sameColor,
  );
  return withRuns(s, runs, s.fontRuns);
}

/** Sets the font of [start, end); with start === end, sets the whole text's font and clears the font runs. */
export function applyFont(
  s: LayerTextStyle,
  start: number,
  end: number,
  fontName: string,
): LayerTextStyle {
  if (start === end) return withRuns({ ...s, fontName }, s.colorRuns, undefined);
  const run: FontRun = { location: start, length: end - start, fontName };
  const runs = normalizeRuns(
    [...cut(s.fontRuns ?? [], start, end), run],
    s.content.length,
    sameFont,
  );
  return withRuns(s, s.colorRuns, runs);
}

/**
 * Replaces [start, end) of the content with `insert`. Later runs shift, runs crossing the removed
 * range shrink, emptied runs go away. The inserted text joins the run with
 * `location < start <= location + length`. The result is cut to MAX_CONTENT.
 */
export function editContent(
  s: LayerTextStyle,
  start: number,
  end: number,
  insert: string,
): LayerTextStyle {
  let content = s.content.slice(0, start) + insert + s.content.slice(end);
  if (content.length > MAX_CONTENT) {
    content = content.slice(0, MAX_CONTENT);
    if (/[\uD800-\uDBFF]$/.test(content)) content = content.slice(0, -1);
  }
  const delta = insert.length - (end - start);
  const afterInsert = start + insert.length;
  // A run starting at or after `start` moves past the inserted text; a run ending at or after
  // `start` (and starting before it) stretches over it.
  const map = (p: number) => (p < start ? p : p >= end ? p + delta : afterInsert);
  const shift = <R extends Span>(runs: readonly R[] | undefined): R[] =>
    (runs ?? []).map((r) => {
      const a = map(r.location);
      return { ...r, location: a, length: map(r.location + r.length) - a };
    });
  const colorRuns = normalizeRuns(shift(s.colorRuns), content.length, sameColor);
  const fontRuns = normalizeRuns(shift(s.fontRuns), content.length, sameFont);
  return withRuns({ ...s, content }, colorRuns, fontRuns);
}

export function styleAt(s: LayerTextStyle, index: number): { fontName: string; rgb: Rgb } {
  const inside = (r: Span) => r.location <= index && index < r.location + r.length;
  const color = s.colorRuns?.find(inside);
  const font = s.fontRuns?.find(inside);
  return {
    fontName: font?.fontName ?? s.fontName,
    rgb: color ? [color.red, color.green, color.blue] : [s.red, s.green, s.blue],
  };
}
