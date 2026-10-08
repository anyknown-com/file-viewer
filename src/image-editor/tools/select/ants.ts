import type { ViewTransform } from "../../api";
import { apply } from "../geom";

/**
 * The outline of the pixels at or above 128 as `x0, y0, x1, y1` segments in document coordinates:
 * every pixel edge between a selected and an unselected pixel, with collinear runs joined.
 */
export function antsSegments(mask: Uint8Array, w: number, h: number): Float32Array {
  const on = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] >= 128;
  const out: number[] = [];
  for (let y = 0; y <= h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && on(x, y - 1) !== on(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) {
        out.push(start, y, x, y);
        start = -1;
      }
    }
  }
  for (let x = 0; x <= w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const edge = y < h && on(x - 1, y) !== on(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) {
        out.push(x, start, x, y);
        start = -1;
      }
    }
  }
  return Float32Array.from(out);
}

/** White line, then black dashes on top that crawl with `time` (ms). The context is dpr-scaled. */
export function drawAnts(
  ctx: CanvasRenderingContext2D,
  segments: Float32Array,
  view: ViewTransform,
  time: number,
): void {
  if (segments.length === 0) return;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < segments.length; i += 4) {
    const a = apply(view.docToScreen, { x: segments[i], y: segments[i + 1] });
    const b = apply(view.docToScreen, { x: segments[i + 2], y: segments[i + 3] });
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -(time / 60) % 8;
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.restore();
}
