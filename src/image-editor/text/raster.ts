import type { EditorApi, Layer, LayerId, MessageKey } from "../api";
import { insertLayer, patchLayer } from "../doc/commands/layers";

/** RGBA8, straight alpha. */
export type Raster = { width: number; height: number; data: Uint8Array };

function layerOf(api: EditorApi, id: LayerId): Layer {
  const layer = api.doc().manifest.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`No layer ${id}.`);
  return layer;
}

/** The layer's texture size; without a texture yet, its transform size rounded (at least 1). */
export function rasterSize(api: EditorApi, id: LayerId): { width: number; height: number } {
  const size = api.pixelSize(id, "image");
  if (size) return size;
  const [w, h] = layerOf(api, id).transform.size;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/**
 * Replaces a layer's pixels and record in one undo step; the id never changes. Same size: written
 * in place over snapshotted tiles. Other size: the texture is swapped for one of the new size. A mask
 * that covered the old transform (maskFile, no maskPlacement) is pinned there by maskPlacement.
 */
export function writeLayerRaster(
  api: EditorApi,
  opts: { id: LayerId; next: Layer; raster: Raster; label: MessageKey },
): void {
  const { id, next, raster, label } = opts;
  const layer = layerOf(api, id);
  const [w0, h0] = layer.transform.size;
  const [w1, h1] = next.transform.size;
  const pinMask =
    layer.maskFile !== undefined && layer.maskPlacement === undefined && (w0 !== w1 || h0 !== h1);
  const patch: Layer = pinMask ? { ...next, maskPlacement: layer.transform } : next;
  const size = rasterSize(api, id);
  if (size.width === raster.width && size.height === raster.height) {
    const rect = { x: 0, y: 0, ...size };
    const tiles = api.snapshotTiles(id, "image", rect);
    api.writeRegion(id, "image", rect, raster.data);
    api.commit(label, patchLayer(id, patch)(api.doc()), tiles);
    return;
  }
  const resize = api.resizePixels(
    id,
    "image",
    { width: raster.width, height: raster.height },
    { pixels: raster.data },
  );
  api.commit(label, patchLayer(id, patch)(api.doc()), [], [resize]);
}

/** Inserts `record` above the active layer with `raster` as its pixels, as one undo step. */
export function addRasterLayer(
  api: EditorApi,
  opts: { record: Layer; raster: Raster; label: MessageKey },
): LayerId {
  const { record, raster, label } = opts;
  api.dispatch(insertLayer(record, api.session().active));
  const rect = { x: 0, y: 0, width: raster.width, height: raster.height };
  api.writeRegion(record.id, "image", rect, raster.data);
  api.commit(label, api.doc(), []);
  api.setSession({ active: record.id });
  return record.id;
}
