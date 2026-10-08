import { ViewerError } from "../../../contract/errors";
import type { EditorApi, Layer, LayerId, LayerResize, PixelTarget } from "../../api";
import { patchLayer } from "../../doc/commands/layers";
import { resizedTransform } from "../../doc/layer-matrix";
import { docRectToLayer, layerPixelSize } from "../geom";

/**
 * Grows the layer's image or mask so it covers the whole canvas, old pixels staying where they
 * are (Photoshop paints past a layer's edge). Patches the transform without a label; the caller
 * passes the returned resize to its commit. Null when it already covers the canvas, or when the
 * budget or texture size says no (the error is shown and painting stays inside the old bounds).
 */
export function growToCanvas(api: EditorApi, id: LayerId, target: PixelTarget): LayerResize | null {
  const { manifest } = api.doc();
  const layer = manifest.layers.find((l) => l.id === id);
  if (!layer) return null;
  const from = layerPixelSize(api, id, target);
  const base = target === "image" ? layer.transform : (layer.maskPlacement ?? layer.transform);
  const canvas = docRectToLayer(
    api,
    id,
    { x: 0, y: 0, width: manifest.width, height: manifest.height },
    target,
  );
  const x0 = Math.min(0, canvas.x);
  const y0 = Math.min(0, canvas.y);
  const x1 = Math.max(from.width, canvas.x + canvas.width);
  const y1 = Math.max(from.height, canvas.y + canvas.height);
  if (x0 === 0 && y0 === 0 && x1 === from.width && y1 === from.height) return null;
  const to = { width: x1 - x0, height: y1 - y0 };
  const offset = { x: -x0, y: -y0 };
  const added = to.width * to.height - from.width * from.height;
  const err = api.checkBudget(target === "image" ? { layerPx: added } : { maskPx: added });
  if (err) {
    api.showError(err);
    return null;
  }
  let resize: LayerResize;
  try {
    resize = api.resizePixels(id, target, to, { offset });
  } catch (e) {
    if (!(e instanceof ViewerError)) throw e;
    api.showError(e);
    return null;
  }
  const t = resizedTransform(base, from, to, offset);
  const patch: Partial<Layer> =
    target === "mask"
      ? { maskPlacement: t }
      : layer.maskFile !== undefined && layer.maskPlacement === undefined
        ? { transform: t, maskPlacement: layer.transform }
        : { transform: t };
  api.dispatch(patchLayer(id, patch));
  return resize;
}
