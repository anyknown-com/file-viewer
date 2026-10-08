import type { EditorApi, LayerId, LayerResize, PixelTarget } from "../../api";
import { patchLayer } from "../../doc/commands/layers";
import { needsRasterize, rasterizeLayer } from "../commands";
import { layerPixelSize } from "../geom";
import { setToolState } from "../state";
import { growToCanvas } from "./grow";

/**
 * Gets the active layer ready for a paint stroke, or null when there is nothing to paint on.
 * Adjustment layers paint on their mask (one is made, all white, when missing). Text and shape
 * layers ask first (`rasterizeAsk`, answered by PaintPanel) and are rasterized without a label so
 * the change joins the stroke's commit. With `grow`, the target then grows to cover the canvas.
 * Callers make their stroke buffer and tile tracker after this, and commit `resizes` with the stroke.
 */
export async function ensurePaintable(
  api: EditorApi,
  opts: { grow: boolean },
): Promise<{ id: LayerId; target: PixelTarget; resizes: LayerResize[] } | null> {
  const { active } = api.session();
  let { target } = api.session();
  const layer = api.doc().manifest.layers.find((l) => l.id === active);
  if (!layer || layer.isGroup === true) return null;
  const id = layer.id;
  if (layer.adjustment !== undefined) {
    if (layer.maskFile === undefined) {
      api.dispatch(patchLayer(id, { maskFile: `${id}.mask.png` }));
      const { width, height } = layerPixelSize(api, id, "mask");
      api.writeRegion(
        id,
        "mask",
        { x: 0, y: 0, width, height },
        new Uint8Array(width * height).fill(255),
      );
    }
    target = "mask";
    api.setSession({ target });
  } else if (target === "mask" && layer.maskFile === undefined) {
    return null;
  }
  if (target === "image" && needsRasterize(layer)) {
    const ok = await new Promise<boolean>((resolve) =>
      setToolState(api, { rasterizeAsk: { layer: id, resolve } }),
    );
    if (!ok) return null;
    api.dispatch(rasterizeLayer(id));
  }
  const r = opts.grow ? growToCanvas(api, id, target) : null;
  return { id, target, resizes: r ? [r] : [] };
}
