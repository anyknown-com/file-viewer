import type { LayerShapeStyle } from "../../comp/index";
import type { Raster } from "../text/raster";

export const DEFAULT_LINE_WIDTH = 4;

export function defaultShapeStyle(kind: LayerShapeStyle["kind"]): LayerShapeStyle {
  return { kind, red: 0, green: 0, blue: 0, cornerRadius: 0, lineWidth: DEFAULT_LINE_WIDTH };
}

/** Draws the shape filling a `width` x `height` canvas; RGBA8, straight alpha. */
export function renderShape(s: LayerShapeStyle, width: number, height: number): Raster {
  const ctx = new OffscreenCanvas(width, height).getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const color = `rgb(${Math.round(s.red * 255)} ${Math.round(s.green * 255)} ${Math.round(s.blue * 255)})`;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (s.kind === "Rectangle") {
    if (s.cornerRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, Math.min(s.cornerRadius, width / 2, height / 2));
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, width, height);
    }
  } else if (s.kind === "Ellipse") {
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const start = s.start ?? [0, 0];
    const end = s.end ?? [1, 1];
    ctx.lineWidth = s.lineWidth ?? DEFAULT_LINE_WIDTH;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(start[0] * width, start[1] * height);
    ctx.lineTo(end[0] * width, end[1] * height);
    ctx.stroke();
  }
  const data = ctx.getImageData(0, 0, width, height).data;
  return { width, height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}
