import type { Mat2D, Rect } from "../../api";
import { invert } from "../geom";

export type Image = { width: number; height: number; data: Uint8Array };

type Acc = { r: number; g: number; b: number; a: number };

function addTap(acc: Acc, src: Image, sx: number, sy: number, w: number): void {
  if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) return;
  const k = (sy * src.width + sx) * 4;
  const wa = (w * src.data[k + 3]) / 255;
  acc.r += wa * src.data[k];
  acc.g += wa * src.data[k + 1];
  acc.b += wa * src.data[k + 2];
  acc.a += wa;
}

/**
 * `src` drawn through `m` (source pixels → destination pixels) into `dst`, sampled bilinearly at
 * each destination pixel centre. Straight alpha is premultiplied for the sampling; outside is clear.
 */
export function resampleRef(src: Image, m: Mat2D, dst: Rect): Uint8Array {
  const inv = invert(m);
  const out = new Uint8Array(dst.width * dst.height * 4);
  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < dst.width; x++) {
      const px = dst.x + x + 0.5;
      const py = dst.y + y + 0.5;
      const u = inv[0] * px + inv[2] * py + inv[4] - 0.5;
      const v = inv[1] * px + inv[3] * py + inv[5] - 0.5;
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const acc: Acc = { r: 0, g: 0, b: 0, a: 0 };
      for (let j = 0; j < 2; j++) {
        const wy = j ? v - y0 : 1 - (v - y0);
        addTap(acc, src, x0, y0 + j, (1 - (u - x0)) * wy);
        addTap(acc, src, x0 + 1, y0 + j, (u - x0) * wy);
      }
      if (acc.a <= 0) continue;
      const o = (y * dst.width + x) * 4;
      out[o] = Math.round(acc.r / acc.a);
      out[o + 1] = Math.round(acc.g / acc.a);
      out[o + 2] = Math.round(acc.b / acc.a);
      out[o + 3] = Math.round(acc.a * 255);
    }
  }
  return out;
}

/** Multiplies the alpha of straight-alpha RGBA by `k[i] / 255`. */
export function scaleAlpha(rgba: Uint8Array, k: (i: number) => number): Uint8Array {
  const out = rgba.slice();
  for (let i = 0; i < out.length / 4; i++)
    out[i * 4 + 3] = Math.round((out[i * 4 + 3] * k(i)) / 255);
  return out;
}

export const clampRect = (r: Rect, w: number, h: number): Rect => {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(w, r.x + r.width);
  const y1 = Math.min(h, r.y + r.height);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
};

/** `over` on `below`, both straight-alpha RGBA. */
export function sourceOver(below: Uint8Array, over: Uint8Array): Uint8Array {
  const out = below.slice();
  for (let k = 0; k < out.length; k += 4) {
    const sa = over[k + 3] / 255;
    if (sa === 0) continue;
    const da = below[k + 3] / 255;
    const oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) {
      out[k + c] = Math.round((over[k + c] * sa + below[k + c] * da * (1 - sa)) / oa);
    }
    out[k + 3] = Math.round(oa * 255);
  }
  return out;
}
