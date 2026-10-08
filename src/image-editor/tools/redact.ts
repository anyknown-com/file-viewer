import type { EditorApi, PixelTile } from "../api";
import { isPixelLayer, needsRasterize, rasterizeLayer } from "./commands";
import { docRectToLayer, layerPixelSize } from "./geom";
import { selectionBounds } from "./select/mask";
import { selectionInLayer } from "./select/mask-sample";
import { clampRect } from "./select/resample";
import { createTileTracker } from "./tiles";

type Block = { x0: number; y0: number; x1: number; y1: number };

/** The alpha-weighted average color and the average alpha of one block of RGBA `data`. */
function blockAverage(data: Uint8Array, w: number, b: Block): [number, number, number, number] {
  let r = 0;
  let g = 0;
  let bl = 0;
  let a = 0;
  for (let y = b.y0; y < b.y1; y++) {
    for (let o = (y * w + b.x0) * 4; o < (y * w + b.x1) * 4; o += 4) {
      const k = data[o + 3]!;
      r += data[o]! * k;
      g += data[o + 1]! * k;
      bl += data[o + 2]! * k;
      a += k;
    }
  }
  const alpha = Math.round(a / ((b.x1 - b.x0) * (b.y1 - b.y0)));
  return a > 0 ? [r / a, g / a, bl / a, alpha] : [0, 0, 0, alpha];
}

/**
 * Straight-alpha RGBA `data` (`w` × `h`) with every pixel where `sel` ≥ 1 replaced by the average
 * of its `cell` × `cell` block (at least 2): the color mixed in by sel / 255, the alpha set to the
 * block's average alpha. A new array; `data` is unchanged.
 */
export function mosaicRef(
  data: Uint8Array,
  w: number,
  h: number,
  cell: number,
  sel: Uint8Array,
): Uint8Array {
  const n = Math.max(2, Math.round(cell));
  const out = data.slice();
  const cols = Math.ceil(w / n);
  const cache: [number, number, number, number][] = [];
  for (let i = 0; i < w * h; i++) {
    const s = sel[i]! / 255;
    if (s === 0) continue;
    const bx = Math.floor((i % w) / n);
    const by = Math.floor(i / w / n);
    const x0 = bx * n;
    const y0 = by * n;
    const avg = (cache[by * cols + bx] ??= blockAverage(data, w, {
      x0,
      y0,
      x1: Math.min(w, x0 + n),
      y1: Math.min(h, y0 + n),
    }));
    const o = i * 4;
    for (let c = 0; c < 3; c++)
      out[o + c] = Math.round(data[o + c]! + (avg[c]! - data[o + c]!) * s);
    out[o + 3] = avg[3];
  }
  return out;
}

/** Straight-alpha RGBA `data` with every pixel where `sel` ≥ 1 mixed toward opaque black by sel / 255. */
export function blackRef(data: Uint8Array, sel: Uint8Array): Uint8Array {
  const out = data.slice();
  for (let i = 0; i < sel.length; i++) {
    const s = sel[i]! / 255;
    if (s === 0) continue;
    const o = i * 4;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(data[o + c]! * (1 - s));
    out[o + 3] = Math.round(data[o + 3]! + (255 - data[o + 3]!) * s);
  }
  return out;
}

/**
 * Redacts the selection on every pixel layer, hidden ones included, as one undo step. Text and
 * shape layers it touches are rasterized in the same step; folders, adjustment layers and masks
 * are left alone.
 */
export function redactSelection(
  api: EditorApi,
  opts: { style: "mosaic" | "black"; cell: number },
): void {
  const bounds = selectionBounds(api);
  if (!bounds) return;
  const tiles: PixelTile[] = [];
  for (const layer of api.doc().manifest.layers) {
    if (!isPixelLayer(layer)) continue;
    const size = layerPixelSize(api, layer.id);
    const rect = clampRect(docRectToLayer(api, layer.id, bounds), size.width, size.height);
    if (rect.width === 0 || rect.height === 0) continue;
    if (needsRasterize(layer)) api.dispatch(rasterizeLayer(layer.id));
    const sel = selectionInLayer(api, layer.id, rect);
    const tracker = createTileTracker(api, layer.id, "image");
    tracker.touch(rect);
    const px = api.readRegion(layer.id, "image", rect);
    const out =
      opts.style === "mosaic"
        ? mosaicRef(px, rect.width, rect.height, opts.cell, sel)
        : blackRef(px, sel);
    api.writeRegion(layer.id, "image", rect, out);
    tiles.push(...tracker.tiles());
  }
  if (tiles.length > 0) api.commit("image.paint.redactConfirm", api.doc(), tiles);
}
