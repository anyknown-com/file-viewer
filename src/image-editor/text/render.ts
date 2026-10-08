import type { LayerTextStyle } from "../../comp/index";
import { canvasMeasure, setTextStyle } from "./fonts";
import { layoutText } from "./layout";
import { lineHeight } from "./style";

function context2d(width: number, height: number): OffscreenCanvasRenderingContext2D {
  const ctx = new OffscreenCanvas(width, height).getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context is not available");
  return ctx;
}

/**
 * Draws a text layer to RGBA8 pixels with straight alpha. Call `ensureGeist()` first. Each piece is
 * drawn with one fillText so ligatures and shaping (Arabic, Indic) stay intact.
 */
export function renderText(s: LayerTextStyle): { width: number; height: number; data: Uint8Array } {
  const { width, height, lines } = layoutText(s, canvasMeasure(context2d(1, 1)));
  const ctx = context2d(width, height);
  ctx.textBaseline = "top";
  const lh = lineHeight(s);
  for (const line of lines) {
    const y = line.top + (lh - s.fontSize) / 2;
    for (const p of line.pieces) {
      setTextStyle(ctx, p.fontName, s.fontSize, s.tracking);
      const [r, g, b] = p.rgb.map((c) => Math.round(c * 255));
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillText(s.content.slice(p.start, p.end), p.x, y);
    }
  }
  const pixels = ctx.getImageData(0, 0, width, height).data;
  return { width, height, data: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length) };
}
