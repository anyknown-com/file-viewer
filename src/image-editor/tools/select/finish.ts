import type { EditorApi, Rect } from "../../api";
import { deselect, type MaskOp, selectionOf, selectOptions, writeSelection } from "./mask";
import { featherSelection } from "./morph";

/** Cuts the part of `bytes` (R8 over `rect`) that lies on the canvas. */
function cropToCanvas(
  bytes: Uint8Array,
  rect: Rect,
  w: number,
  h: number,
): { bytes: Uint8Array; rect: Rect } {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(w, rect.x + rect.width);
  const y1 = Math.min(h, rect.y + rect.height);
  const out = { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  const cut = new Uint8Array(out.width * out.height);
  for (let y = 0; y < out.height; y++) {
    const from = (y0 + y - rect.y) * rect.width + (x0 - rect.x);
    cut.set(bytes.subarray(from, from + out.width), y * out.width);
  }
  return { bytes: cut, rect: out };
}

/** Merges a finished shape into the selection, then feathers by the panel's radius. */
export function finishShape(api: EditorApi, bytes: Uint8Array, rect: Rect, op: MaskOp): void {
  const { width, height } = selectionOf(api);
  const cut = cropToCanvas(bytes, rect, width, height);
  writeSelection(api, cut.bytes, cut.rect, op);
  const { feather } = selectOptions(api);
  if (feather > 0) featherSelection(api, feather);
}

/** A click without a drag clears the selection, unless a modifier asked to combine. */
export function clickDeselect(api: EditorApi, op: MaskOp): void {
  if (op === "replace") deselect(api);
}
