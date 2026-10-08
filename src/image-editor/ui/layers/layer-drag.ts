// Pointer drag in the layer list: reorder and drop into folders; Alt-click between two rows clips.
import type { EditorApi, LayerId } from "../../api";
import { moveLayers } from "../../doc/commands/index";
import { withDescendants } from "../../doc/commands/layers";
import { children } from "../../doc/tree";
import { run, toggleClip } from "../../layer-ops";

type Place = "above" | "below" | "into";
type Drop = { row: HTMLElement; place: Place; parent: LayerId | null; index: number };

const SLOP = 4;
const EDGE = 4;

function rowsOf(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>("[data-layer-id]")];
}

/** Where a drop at `y` over `row` puts the moving layer: its new parent and index (0 = bottom). */
function dropAt(api: EditorApi, moving: Set<LayerId>, row: HTMLElement, y: number): Drop | null {
  const id = row.dataset.layerId as LayerId;
  if (moving.has(id)) return null;
  const m = api.doc().manifest;
  const layer = m.layers.find((l) => l.id === id);
  if (!layer) return null;
  const r = row.getBoundingClientRect();
  const at = (y - r.top) / r.height;
  const folder = layer.isGroup === true;
  const open = folder && row.getAttribute("aria-expanded") === "true";
  // The rows under an open folder are its top children, so below its row is inside it.
  if (folder && ((at > 0.25 && at < 0.75) || (at >= 0.75 && open))) {
    return { row, place: "into", parent: id, index: Number.MAX_SAFE_INTEGER };
  }
  const parent = layer.parentID ?? null;
  const siblings = children(m, parent).filter((l) => !moving.has(l.id));
  const i = siblings.findIndex((l) => l.id === id);
  return at < 0.5
    ? { row, place: "above", parent, index: i + 1 }
    : { row, place: "below", parent, index: i };
}

function mark(list: HTMLElement, drop: Drop | null): void {
  for (const row of rowsOf(list)) {
    if (drop?.row === row) row.dataset.drop = drop.place;
    else delete row.dataset.drop;
  }
}

/** From a primary-button pointerdown on a row: past 4 px it is a drag; the drop is one undo step. */
export function startLayerDrag(e: PointerEvent, list: HTMLElement, api: EditorApi, id: LayerId) {
  if (e.button !== 0) return;
  const from = { x: e.clientX, y: e.clientY };
  const moving = withDescendants(api.doc(), [id]);
  let dragging = false;
  let drop: Drop | null = null;
  const view = list.ownerDocument;

  const onMove = (ev: PointerEvent) => {
    if (!dragging && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < SLOP) return;
    dragging = true;
    list.dataset.dragging = "";
    const hit = view
      .elementFromPoint(ev.clientX, ev.clientY)
      ?.closest<HTMLElement>("[data-layer-id]");
    drop = hit && list.contains(hit) ? dropAt(api, moving, hit, ev.clientY) : null;
    mark(list, drop);
  };
  const onUp = () => {
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onUp);
    delete list.dataset.dragging;
    mark(list, null);
    if (dragging && drop) {
      run(api, moveLayers([id], { parent: drop.parent, index: drop.index }), "image.layers.move");
    }
  };
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onUp);
}

/**
 * Alt-click within 4 px of the line between two rows: the upper layer clips to the one below, or
 * stops clipping when it already does. True when the click was on such a line.
 */
export function clipAtBoundary(e: PointerEvent, list: HTMLElement, api: EditorApi): boolean {
  if (!e.altKey) return false;
  const rows = rowsOf(list);
  for (let i = 0; i + 1 < rows.length; i++) {
    const line = rows[i].getBoundingClientRect().bottom;
    if (Math.abs(e.clientY - line) > EDGE) continue;
    toggleClip(api, rows[i].dataset.layerId as LayerId);
    return true;
  }
  return false;
}
