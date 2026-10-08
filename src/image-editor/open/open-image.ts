// Opens a plain image (PNG, JPEG, WebP, AVIF, BMP) as a one-layer document.
import { readBlob, type FileRef } from "../../contract/byte-source";
import { ViewerError } from "../../contract/errors";
import { mimeOf } from "../../contract/kinds";
import type { Limits } from "../../contract/limits";
import type { Doc } from "../api";
import type { TextureStore } from "../engine/textures";
import { IMAGE_MAX_PIXELS } from "../limits";
import { newManifest } from "./new-manifest";
import { OpenFailure } from "./open-failure";

const tooManyPixels = () =>
  new OpenFailure(new ViewerError("too_large"), "image.open.tooManyPixels");

/** Whether the browser gives a working 2D canvas this size: write a pixel and read it back. */
function canvasFits(width: number, height: number): boolean {
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "#fff";
    ctx.fillRect(width - 1, height - 1, 1, 1);
    const ok = ctx.getImageData(width - 1, height - 1, 1, 1).data[3] === 255;
    canvas.width = 0;
    canvas.height = 0;
    return ok;
  } catch {
    return false;
  }
}

export async function openImage(
  file: FileRef,
  limits: Limits,
  textures: TextureStore,
  signal: AbortSignal,
): Promise<Doc> {
  if (file.source.size > limits.previewBytes) {
    throw new OpenFailure(new ViewerError("too_large"), "error.too_large");
  }
  const blob = await readBlob(file.source, { type: mimeOf(file), signal });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
      premultiplyAlpha: "none",
    });
  } catch (e) {
    throw new ViewerError("decode_failed", { cause: e });
  }
  try {
    signal.throwIfAborted();
    const { width, height } = bitmap;
    if (width * height > IMAGE_MAX_PIXELS || !canvasFits(width, height)) throw tooManyPixels();
    const id = crypto.randomUUID().toUpperCase();
    textures.upload(id, "image", bitmap);
    return {
      manifest: newManifest({ width, height, layerId: id, name: "Background" }),
      pixels: new Map([[id, { image: { kind: "gpu" } }]]),
    };
  } finally {
    bitmap.close();
  }
}
