// The document as a `.comp.zip`: original PNGs as they were, GPU pixels encoded, and a preview.
import { writeProject, type LayerRecord } from "../../comp/index"; // 09
import type { Doc, EditorApi, Layer, LayerPixels, PixelTarget } from "../api";
import { PREVIEW_MAX_PIXELS } from "../limits";
import { renderRect, usableCanvas } from "./flatten";

const PREVIEW_SIDE = 1024;

type Pending = Uint8Array | Promise<Uint8Array>;

/** The PNG bytes of one layer image or mask, or null when it has no pixels at all. */
function pixelsOf(
  api: EditorApi,
  layer: Layer,
  target: PixelTarget,
  stored: LayerPixels | undefined,
): Pending | null {
  if (stored?.kind === "png") return stored.bytes;
  if (stored?.png) return stored.png;
  const size = api.pixelSize(layer.id, target);
  if (!size) {
    // Compositor writes no image for a blank layer; a mask with no texture yet reads as white.
    if (target === "image") return null;
    const width = Math.max(1, Math.round(layer.transform.size[0]));
    const height = Math.max(1, Math.round(layer.transform.size[1]));
    const data = new Uint8Array(width * height).fill(255);
    return encode(api, { width, height, channels: 1, data });
  }
  // Read now, so the file holds the pixels as they were when the save started.
  const data = api.readRegion(layer.id, target, { x: 0, y: 0, ...size });
  return encode(api, { ...size, channels: target === "image" ? 4 : 1, data });
}

function encode(
  api: EditorApi,
  input: { width: number; height: number; channels: 1 | 4; data: Uint8Array },
): Promise<Uint8Array> {
  return api.runInWorker({ kind: "encodePng", input }, [input.data.buffer]);
}

/** QuickLook/Preview.jpg: the long side at most 1024 px, on white; none above PREVIEW_MAX_PIXELS. */
function preview(api: EditorApi, doc: Doc): Promise<Uint8Array> | null {
  const { width, height } = doc.manifest;
  if (width * height > PREVIEW_MAX_PIXELS) return null;
  const scale = Math.min(1, PREVIEW_SIDE / Math.max(width, height));
  const out = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
  const rgba = renderRect(api, doc, { x: 0, y: 0, width, height }, { background: "white", out });
  const usable = usableCanvas(out.width, out.height);
  if (!usable) return null;
  const pixels = new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.length);
  usable.ctx.putImageData(new ImageData(pixels, out.width, out.height), 0, 0);
  return usable.canvas
    .convertToBlob({ type: "image/jpeg", quality: 0.8 })
    .then(async (blob) => new Uint8Array(await blob.arrayBuffer()));
}

/**
 * `doc` as a 09 project. Every GPU read happens before the first await, so edits made while the
 * PNGs encode do not reach the file.
 */
export async function projectBlob(api: EditorApi, doc: Doc): Promise<Blob> {
  const assets = new Map<string, Pending>();
  const layers: LayerRecord[] = doc.manifest.layers.map((layer) => {
    const stored = doc.pixels.get(layer.id);
    const next: LayerRecord = { ...layer };
    if (layer.isGroup !== true && layer.adjustment === undefined) {
      const image = pixelsOf(api, layer, "image", stored?.image);
      if (image) {
        next.imageFile = layer.imageFile ?? `${layer.id}.png`;
        assets.set(`images/${next.imageFile}`, image);
      } else delete next.imageFile;
    }
    if (layer.maskFile !== undefined) {
      const mask = pixelsOf(api, layer, "mask", stored?.mask);
      if (mask) assets.set(`images/${layer.maskFile}`, mask);
    }
    return next;
  });
  const jpeg = preview(api, doc);
  const names = [...assets.keys()];
  const bytes = await Promise.all(assets.values());
  return writeProject({
    manifest: { ...doc.manifest, layers },
    assets: new Map(names.map((name, i) => [name, bytes[i]])),
    preview: (await jpeg) ?? undefined,
  });
}
