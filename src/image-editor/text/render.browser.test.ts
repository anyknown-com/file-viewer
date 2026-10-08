import { beforeAll, describe, expect, it } from "vitest";
import type { LayerTextStyle } from "../../comp/index";
import { canvasMeasure, cssFont, ensureGeist } from "./fonts";
import { layoutText } from "./layout";
import { renderText } from "./render";
import { defaultTextStyle } from "./style";

type Pixels = ReturnType<typeof renderText>;

function measure() {
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  return canvasMeasure(ctx);
}

function style(content: string, patch: Partial<LayerTextStyle> = {}): LayerTextStyle {
  return { ...defaultTextStyle(content), ...patch };
}

/** Columns [left, right] that hold any pixel matching `test`. */
function inkColumns(p: Pixels, test: (i: number) => boolean): [number, number] | null {
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (!test((y * p.width + x) * 4)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return left <= right ? [left, right] : null;
}

beforeAll(async () => {
  await ensureGeist();
});

describe("renderText", () => {
  it("loads Geist", () => {
    expect(document.fonts.check('400 32px "Geist Variable"')).toBe(true);
  });

  it("sizes point text by the padding rule", () => {
    const s = style("Hello", { fontSize: 32 });
    const w = measure()("Hello", "Geist-Regular", 32, 0);
    const out = renderText(s);
    expect(out.width).toBe(Math.max(16, Math.ceil(w + 24 + 3.2)));
    expect(out.height).toBe(Math.ceil(1.2 * 32 + 24));
    expect(out.data).toHaveLength(out.width * out.height * 4);
  });

  it("uses boxSize as the canvas of a paragraph box", () => {
    const out = renderText(style("Hello world", { boxSize: [300, 120] }));
    expect([out.width, out.height]).toEqual([300, 120]);
  });

  it("draws a color run only over its characters", () => {
    const s = style("HHHHH", {
      colorRuns: [{ location: 1, length: 2, red: 1, green: 0, blue: 0 }],
    });
    const pieces = layoutText(s, measure()).lines[0]?.pieces ?? [];
    expect(pieces).toHaveLength(3);
    const out = renderText(s);
    const isRed = (i: number) =>
      (out.data[i + 3] ?? 0) > 200 && (out.data[i] ?? 0) > 200 && (out.data[i + 1] ?? 255) < 50;
    const red = inkColumns(out, isRed);
    const [, mid] = pieces;
    expect(red).not.toBeNull();
    expect(red?.[0]).toBeGreaterThanOrEqual(Math.floor(mid?.x ?? 0));
    expect(red?.[1]).toBeLessThanOrEqual(Math.ceil((mid?.x ?? 0) + (mid?.width ?? 0)));
  });

  it("draws Arabic in one fillText so its ink matches measureText", () => {
    const text = "مرحبا بالعالم";
    const out = renderText(style(text, { fontSize: 48 }));
    const ink = inkColumns(out, (i) => (out.data[i + 3] ?? 0) > 0);
    // Geist has no Arabic glyphs, so the browser draws this with a fallback font whose ink
    // overhangs the advance width by a platform-dependent amount (≈7 px on Linux CI). Compare
    // against the whole string's own ink bounds instead: drawing it per character would use
    // isolated letter forms, whose ink is wider than the joined string's bounds.
    const ctx = new OffscreenCanvas(1, 1).getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.font = cssFont("Geist-Regular", 48);
    const m = ctx.measureText(text);
    const bounds = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    expect(ink).not.toBeNull();
    const inkWidth = (ink?.[1] ?? 0) - (ink?.[0] ?? 0) + 1;
    expect(Math.abs(inkWidth - bounds)).toBeLessThanOrEqual(2);
  });

  it("leaves pixels outside the text transparent", () => {
    const s = style("Hello", { fontSize: 32 });
    const out = renderText(s);
    const line = layoutText(s, measure()).lines[0];
    if (!line) throw new Error("no line");
    const left = Math.floor(line.x) - 1;
    const right = Math.ceil(line.x + line.width) + 1;
    const top = Math.floor(line.top);
    const bottom = Math.ceil(line.top + 1.2 * 32);
    let stray = 0;
    let ink = 0;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const a = out.data[(y * out.width + x) * 4 + 3] ?? 0;
        if (a === 0) continue;
        ink++;
        if (x < left || x > right || y < top || y > bottom) stray++;
      }
    }
    expect(ink).toBeGreaterThan(0);
    expect(stray).toBe(0);
  });
});
