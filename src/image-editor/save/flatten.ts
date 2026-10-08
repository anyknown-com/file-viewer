// The flattened document at full size, and its encoding as PNG, JPEG or WebP.
import { ViewerError } from "../../contract/errors";
import type { Doc, EditorApi, Rect } from "../api";
import { internalsOf } from "../editor-api";
import { exportTiles, totalReach } from "../engine/tiles";
import { EXPORT_MAX_PIXELS, EXPORT_TILE } from "../limits";

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

const WHITE: [number, number, number, number] = [1, 1, 1, 1];

/** Renders `rect` of `doc` (document px, or `out` px when given) and reads it back straight. */
export function renderRect(
  api: EditorApi,
  doc: Doc,
  rect: Rect,
  opts: { background?: "white"; out?: { width: number; height: number } },
): Uint8Array {
  const { renderer } = internalsOf(api);
  const { width, height } = opts.out ?? rect;
  const buffer = renderer.pool.borrow(width, height);
  const out = { framebuffer: buffer.framebuffer, width, height, docRect: rect };
  const background = opts.background === "white" ? WHITE : undefined;
  renderer.render(doc, api.session(), out, { forExport: true, background });
  const data = renderer.readStraight(buffer.texture, width, height);
  buffer.release();
  return data;
}

/**
 * `doc` flattened at full size, RGBA8 straight alpha, rendered tile by tile.
 * Throws ViewerError("too_large") above EXPORT_MAX_PIXELS.
 */
export function renderFull(api: EditorApi, doc: Doc, opts: { background?: "white" }): Uint8Array {
  const { width, height } = doc.manifest;
  if (width * height > EXPORT_MAX_PIXELS) throw new ViewerError("too_large");
  const maxTexture = api.gl.getParameter(api.gl.MAX_TEXTURE_SIZE) as number;
  const tiles = exportTiles(doc, EXPORT_TILE, totalReach(doc, 1), maxTexture);
  const full = new Uint8Array(width * height * 4);
  for (const tile of tiles) {
    const data = renderRect(api, doc, tile, opts);
    const row = tile.width * 4;
    for (let y = 0; y < tile.height; y++) {
      full.set(data.subarray(y * row, (y + 1) * row), ((tile.y + y) * width + tile.x) * 4);
    }
  }
  return full;
}

/** A 2D OffscreenCanvas of this size that keeps a written pixel, or null. */
export function usableCanvas(
  width: number,
  height: number,
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } | null {
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1), 0, 0);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return r === 1 && g === 2 && b === 3 ? { canvas, ctx } : null;
  } catch {
    return null;
  }
}

/**
 * Encodes RGBA8 straight alpha. PNG goes through the worker's encodePng job; JPEG and WebP through
 * OffscreenCanvas.convertToBlob, whose `type` may come back different (Safari's WebP gives PNG).
 * Throws ViewerError("too_large") when no usable canvas of this size can be made.
 */
export async function encodeImage(
  rgba: Uint8Array,
  width: number,
  height: number,
  type: ImageType,
  quality: number,
  worker: Pick<EditorApi, "runInWorker">,
): Promise<{ blob: Blob; type: string }> {
  if (type === "image/png") {
    const input = { width, height, channels: 4 as const, data: rgba };
    const png = await worker.runInWorker({ kind: "encodePng", input }, [rgba.buffer]);
    return { blob: new Blob([png as Uint8Array<ArrayBuffer>], { type }), type };
  }
  const usable = usableCanvas(width, height);
  if (!usable) throw new ViewerError("too_large");
  const pixels = new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.length);
  usable.ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await usable.canvas.convertToBlob({ type, quality });
  return { blob, type: blob.type };
}
