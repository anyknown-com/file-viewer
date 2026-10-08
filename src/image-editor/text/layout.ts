// Text layout follows Compositor (github.com/robbietilton/Compositor @11d8d7a,
// Compositor/Document/TypeTool.swift): 12 px padding, a paragraph box wraps at its width − 24,
// point text only breaks at "\n".
import type { LayerTextStyle } from "../../comp/index";
import { styleAt } from "./runs";
import { MIN_TEXT_SIDE, TEXT_PADDING, lineHeight } from "./style";

/** Width of `text` like canvas measureText with letterSpacing = tracking (added after every character, the last one too). */
export type Measure = (
  text: string,
  fontName: string,
  fontSize: number,
  tracking: number,
) => number;

export type Piece = {
  start: number;
  end: number;
  x: number;
  width: number;
  fontName: string;
  rgb: [number, number, number];
};

/** `start` / `end` are UTF-16 positions in `content`, without the line break and trailing white space. */
export type Line = {
  start: number;
  end: number;
  top: number;
  x: number;
  width: number;
  pieces: Piece[];
};

type Range = { start: number; end: number };

const WHITE = /\s/;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const words = new Intl.Segmenter(undefined, { granularity: "word" });
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function segments(seg: Intl.Segmenter, text: string, offset: number): Range[] {
  return Array.from(seg.segment(text), (s) => ({
    start: offset + s.index,
    end: offset + s.index + s.segment.length,
  }));
}

/** Break units of a paragraph: word segments, with CJK segments split into graphemes. */
function units(content: string, start: number, end: number): Range[] {
  const out: Range[] = [];
  for (const w of segments(words, content.slice(start, end), start)) {
    const text = content.slice(w.start, w.end);
    if (CJK.test(text)) out.push(...segments(graphemes, text, w.start));
    else out.push(w);
  }
  return out;
}

function trimEnd(content: string, start: number, end: number): number {
  while (end > start && WHITE.test(content[end - 1] ?? "")) end--;
  return end;
}

/** Splits [start, end) at color and font run edges; x is relative to the line start. */
function pieces(s: LayerTextStyle, start: number, end: number, measure: Measure): Piece[] {
  const cuts = new Set([start, end]);
  for (const r of [...(s.colorRuns ?? []), ...(s.fontRuns ?? [])]) {
    for (const p of [r.location, r.location + r.length]) if (p > start && p < end) cuts.add(p);
  }
  const edges = [...cuts].toSorted((a, b) => a - b);
  const out: Piece[] = [];
  let x = 0;
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i] ?? 0;
    const b = edges[i + 1] ?? 0;
    const { fontName, rgb } = styleAt(s, a);
    const width = measure(s.content.slice(a, b), fontName, s.fontSize, s.tracking);
    out.push({ start: a, end: b, x, width, fontName, rgb });
    x += width;
  }
  return out;
}

function widthOf(s: LayerTextStyle, start: number, end: number, measure: Measure): number {
  return pieces(s, start, end, measure).reduce((sum, p) => sum + p.width, 0);
}

/** Greedy wrap of one paragraph inside `wrap` px. */
function wrapParagraph(s: LayerTextStyle, para: Range, wrap: number, measure: Measure): Range[] {
  const lines: Range[] = [];
  let lineStart = para.start;
  let cur = para.start;
  const fits = (end: number) =>
    widthOf(s, lineStart, trimEnd(s.content, lineStart, end), measure) <= wrap;
  const breakLine = () => {
    lines.push({ start: lineStart, end: cur });
    lineStart = cur;
  };
  for (const unit of units(s.content, para.start, para.end)) {
    if (fits(unit.end)) {
      cur = unit.end;
      continue;
    }
    if (cur > lineStart) {
      breakLine();
      if (fits(unit.end)) {
        cur = unit.end;
        continue;
      }
    }
    // One unit wider than the line: break between its graphemes.
    const text = s.content.slice(unit.start, unit.end);
    for (const g of segments(graphemes, text, unit.start)) {
      if (cur > lineStart && !fits(g.end)) breakLine();
      cur = g.end;
    }
  }
  lines.push({ start: lineStart, end: cur });
  return lines;
}

function paragraphs(content: string): Range[] {
  const out: Range[] = [];
  let start = 0;
  for (const part of content.split("\n")) {
    out.push({ start, end: start + part.length });
    start += part.length + 1;
  }
  return out;
}

const size = (n: number) => Math.max(MIN_TEXT_SIDE, Math.ceil(n));

export function layoutText(
  s: LayerTextStyle,
  measure: Measure,
): { width: number; height: number; lines: Line[] } {
  const box = s.boxSize;
  const pad = TEXT_PADDING;
  const ranges = paragraphs(s.content).flatMap((p) =>
    box ? wrapParagraph(s, p, box[0] - 2 * pad, measure) : [p],
  );
  const lh = lineHeight(s);
  const laid = ranges.map((r, i) => {
    const end = trimEnd(s.content, r.start, r.end);
    const ps = pieces(s, r.start, end, measure);
    const width = ps.reduce((sum, p) => sum + p.width, 0);
    return { start: r.start, end, top: pad + i * lh, width, pieces: ps };
  });
  const widest = laid.reduce((w, l) => Math.max(w, l.width), 0);
  const room = box ? box[0] - 2 * pad : widest;
  const lines: Line[] = laid.map((l) => {
    const free = room - l.width;
    const x = pad + (s.alignment === "Center" ? free / 2 : s.alignment === "Right" ? free : 0);
    return { ...l, x, pieces: l.pieces.map((p) => ({ ...p, x: x + p.x })) };
  });
  const width = box ? size(box[0]) : size(widest + 2 * pad + 0.1 * s.fontSize);
  const height = box ? size(box[1]) : size(Math.max(1, lines.length) * lh + 2 * pad);
  return { width, height, lines };
}
