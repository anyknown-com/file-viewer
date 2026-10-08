// The text tool (T): click for point text, drag for a paragraph box, click a text layer to edit it.
import type { EditorApi, Layer, LayerId, Mat2D, Point, ToolSpec, ViewTransform } from "../api";
import { apply, invert } from "../tools/geom";
import { beginEdit, endEdit, textEditing, type TextEditing } from "./edit-state";
import { TextIcon } from "./glyphs";
import { resizeTextBox } from "./layer";
import { getNextTextStyle, TextPanel } from "./panel";
import { rasterSize } from "./raster";
import { MAX_BOX, MIN_BOX, TEXT_PADDING } from "./style";

const HANDLE_REACH = 6; // screen px
const DRAG_MIN = 4; // document px
const HANDLES: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
];

type Drag =
  | { kind: "create"; start: Point; at: Point }
  | { kind: "handle"; handle: readonly [number, number]; at: Point };

let drag: Drag | null = null;
let lastView: ViewTransform | null = null;

const clamp = (n: number) => Math.min(MAX_BOX, Math.max(MIN_BOX, Math.round(n)));

const layerOf = (api: EditorApi, id: LayerId | null): Layer | undefined =>
  id === null ? undefined : api.doc().manifest.layers.find((l) => l.id === id);

/** Edited layer pixels → document. */
function layerToDoc(api: EditorApi, ed: TextEditing): Mat2D {
  if (ed.layerId !== null && layerOf(api, ed.layerId)) return invert(api.layerMatrix(ed.layerId));
  return [1, 0, 0, 1, ed.origin[0], ed.origin[1]];
}

/** The edited layer's size in its pixels; null for new point text (no layer yet). */
function editSize(api: EditorApi, ed: TextEditing): [number, number] | null {
  if (ed.style.boxSize) return ed.style.boxSize;
  if (ed.layerId !== null && layerOf(api, ed.layerId)) {
    const { width, height } = rasterSize(api, ed.layerId);
    return [width, height];
  }
  return null;
}

const editing = (): TextEditing | null => {
  const ed = textEditing.get();
  return ed && !ed.missing ? ed : null;
};

function handleAt(api: EditorApi, ed: TextEditing, p: Point): readonly [number, number] | null {
  const box = ed.style.boxSize;
  const view = lastView;
  if (!box || !view) return null;
  const m = layerToDoc(api, ed);
  const at = apply(view.docToScreen, p);
  return (
    HANDLES.find(([hx, hy]) => {
      const s = apply(view.docToScreen, apply(m, { x: hx * box[0], y: hy * box[1] }));
      return Math.hypot(s.x - at.x, s.y - at.y) <= HANDLE_REACH;
    }) ?? null
  );
}

/** The box after dragging `handle` to `p`, in layer pixels, and where its top-left lands. */
function draggedBox(
  api: EditorApi,
  ed: TextEditing,
  handle: readonly [number, number],
  p: Point,
): { box: [number, number]; origin: [number, number] } {
  const [w, h] = ed.style.boxSize ?? [MIN_BOX, MIN_BOX];
  const m = layerToDoc(api, ed);
  const q = apply(invert(m), p);
  let [x0, y0, x1, y1] = [0, 0, w, h];
  if (handle[0] === 0) x0 = q.x;
  if (handle[0] === 1) x1 = q.x;
  if (handle[1] === 0) y0 = q.y;
  if (handle[1] === 1) y1 = q.y;
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const from = apply(m, { x: 0, y: 0 });
  const to = apply(m, { x: left, y: top });
  const base = layerOf(api, ed.layerId)?.transform.origin ?? ed.origin;
  return {
    box: [clamp(Math.abs(x1 - x0)), clamp(Math.abs(y1 - y0))],
    origin: [base[0] + to.x - from.x, base[1] + to.y - from.y],
  };
}

/** The topmost visible text layer with `p` (document) inside its pixels. */
function textLayerAt(api: EditorApi, p: Point): LayerId | null {
  const layers = api.doc().manifest.layers;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l?.text || !l.isVisible) continue;
    const q = apply(api.layerMatrix(l.id), p);
    const { width, height } = rasterSize(api, l.id);
    if (q.x >= 0 && q.y >= 0 && q.x < width && q.y < height) return l.id;
  }
  return null;
}

/** Commits a dragged box handle, then keeps editing with the layer's new box. */
async function resizeBox(
  api: EditorApi,
  id: LayerId,
  box: [number, number],
  origin: [number, number],
): Promise<void> {
  await resizeTextBox(api, id, box, origin);
  const now = editing();
  const layer = layerOf(api, id);
  if (now?.layerId !== id || !layer?.text) return;
  const style = { ...now.style, boxSize: layer.text.boxSize };
  textEditing.set({ ...now, style, origin: layer.transform.origin });
}

export { beginEdit, endEdit };

export const textTool: ToolSpec = {
  id: "text",
  key: "T",
  label: "image.text.tool",
  icon: TextIcon,
  cursor: "text",
  onPointerDown(p, _e, api) {
    const ed = textEditing.get();
    if (ed) {
      const handle = ed.missing ? null : handleAt(api, ed, p);
      if (handle) drag = { kind: "handle", handle, at: p };
      else if (!ed.missing) void endEdit(api);
      return;
    }
    const hit = textLayerAt(api, p);
    if (hit !== null) beginEdit(api, hit, lastView);
    else drag = { kind: "create", start: p, at: p };
  },
  onPointerMove(p, _e, api) {
    if (!drag) return;
    drag.at = p;
    api.requestRender();
  },
  onPointerUp(p, _e, api) {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.kind === "handle") {
      const ed = editing();
      if (!ed) return;
      const { box, origin } = draggedBox(api, ed, d.handle, p);
      const id = ed.layerId;
      if (id === null) {
        textEditing.set({ ...ed, style: { ...ed.style, boxSize: box }, origin });
        return;
      }
      void resizeBox(api, id, box, origin);
      return;
    }
    const { start } = d;
    const base = { layerId: null, selection: [0, 0], view: lastView, missing: null } as const;
    if (Math.hypot(p.x - start.x, p.y - start.y) > DRAG_MIN) {
      const x = Math.round(Math.min(start.x, p.x));
      const y = Math.round(Math.min(start.y, p.y));
      const boxSize: [number, number] = [
        clamp(Math.abs(p.x - start.x)),
        clamp(Math.abs(p.y - start.y)),
      ];
      textEditing.set({
        ...base,
        selection: [0, 0],
        style: { ...getNextTextStyle(), boxSize },
        origin: [x, y],
      });
      return;
    }
    const origin: [number, number] = [p.x - TEXT_PADDING, p.y - TEXT_PADDING];
    textEditing.set({ ...base, selection: [0, 0], style: getNextTextStyle(), origin });
  },
  onKeyDown(e, api) {
    if (e.key !== "Escape" || !textEditing.get()) return false;
    void endEdit(api);
    return true;
  },
  drawOverlay(ctx, view, api) {
    lastView = view;
    const ed = textEditing.get();
    if (ed && !sameView(ed.view, view)) textEditing.set({ ...ed, view });
    const toScreen = (m: Mat2D, x: number, y: number) =>
      apply(view.docToScreen, apply(m, { x, y }));
    if (drag?.kind === "create") {
      const a = apply(view.docToScreen, drag.start);
      const b = apply(view.docToScreen, drag.at);
      ctx.beginPath();
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      outline(ctx);
      return;
    }
    const live = editing();
    if (!live) return;
    let m = layerToDoc(api, live);
    let size = editSize(api, live);
    if (drag?.kind === "handle") {
      const { box, origin } = draggedBox(api, live, drag.handle, drag.at);
      const base = layerOf(api, live.layerId)?.transform.origin ?? live.origin;
      m = [m[0], m[1], m[2], m[3], m[4] + origin[0] - base[0], m[5] + origin[1] - base[1]];
      size = box;
    }
    if (!size) return;
    const [w, h] = size;
    const corners = [toScreen(m, 0, 0), toScreen(m, w, 0), toScreen(m, w, h), toScreen(m, 0, h)];
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    outline(ctx);
    if (!live.style.boxSize) return;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    for (const [hx, hy] of HANDLES) {
      const c = toScreen(m, hx * w, hy * h);
      ctx.fillRect(c.x - 3, c.y - 3, 6, 6);
      ctx.strokeRect(c.x - 3, c.y - 3, 6, 6);
    }
  },
  onDeactivate: (api) => void endEdit(api),
  panel: TextPanel,
};

/** The current path as white under black dashes, like the selection tools' outlines. */
function outline(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.setLineDash([]);
}

function sameView(a: ViewTransform | null, b: ViewTransform): boolean {
  return a !== null && a.zoom === b.zoom && a.docToScreen.every((v, i) => v === b.docToScreen[i]);
}
