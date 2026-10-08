import type { EditorApi, MessageKey, PixelTarget } from "../../api";
import { docRectToLayer, layerPixelSize } from "../geom";
import { createTileTracker } from "../tiles";
import { selectionBounds } from "./mask";
import { selectionInLayer } from "./mask-sample";
import { withRasterized } from "./rasterize-dialog";
import { clampRect } from "./resample";

/**
 * Edits the active layer's image or mask inside the selection as one undo step: `edit` gets the
 * pixels of the selection's box and the selection (0–255) over the same box, and changes the
 * pixels in place. Without a selection it does nothing, or covers the whole target when
 * `wholeIfNone`. False when there is nothing to edit.
 */
export function editSelected(
  api: EditorApi,
  label: MessageKey,
  opts: { wholeIfNone: boolean },
  edit: (px: Uint8Array, sel: Uint8Array, target: PixelTarget) => void,
): boolean {
  const { active, target } = api.session();
  const layer = api.doc().manifest.layers.find((l) => l.id === active);
  if (!layer || layer.isGroup === true) return false;
  if (target === "image" ? layer.adjustment !== undefined : layer.maskFile === undefined)
    return false;
  const bounds = selectionBounds(api);
  if (!bounds && !opts.wholeIfNone) return false;
  const size = layerPixelSize(api, layer.id, target);
  const rect = bounds
    ? clampRect(docRectToLayer(api, layer.id, bounds, target), size.width, size.height)
    : { x: 0, y: 0, ...size };
  if (rect.width === 0 || rect.height === 0) return false;
  withRasterized(api, layer.id, target, () => {
    const tracker = createTileTracker(api, layer.id, target);
    tracker.touch(rect);
    const px = api.readRegion(layer.id, target, rect);
    edit(px, selectionInLayer(api, layer.id, rect, target), target);
    api.writeRegion(layer.id, target, rect, px);
    api.commit(label, api.doc(), tracker.tiles());
  });
  return true;
}
