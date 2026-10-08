import type { EditorApi, Point, Rect, ToolSpec, ViewTransform } from "../../api";
import { apply } from "../geom";
import { LassoGlyph, PolygonLassoGlyph } from "../glyphs";
import { finishShape } from "./finish";
import { opFromEvent, selectOptions } from "./mask";
import { SelectPanel } from "./select-panel";

const SUB = 4;

/** Even-odd fill of `points` into an R8 over `rect`, with 4 × 4 samples per pixel. */
export function polygonMask(points: Point[], rect: Rect): Uint8Array {
  const { width: w, height: h } = rect;
  const counts = new Uint8Array(w * h);
  const n = points.length;
  for (let row = 0; row < h * SUB; row++) {
    const y = rect.y + (row + 0.5) / SUB;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      if (a.y <= y !== b.y <= y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - rect.x) * SUB - 0.5));
      const to = Math.min(w * SUB - 1, Math.floor((xs[k + 1] - rect.x) * SUB - 0.5));
      for (let col = from; col <= to; col++)
        counts[Math.floor(row / SUB) * w + Math.floor(col / SUB)]++;
    }
  }
  return counts.map((c) => Math.round((c * 255) / (SUB * SUB)));
}

export type PolygonEdit = {
  add(p: Point): void;
  undo(): void;
  close(): Point[] | null;
  cancel(): void;
  points(): Point[];
};

export function createPolygonEdit(): PolygonEdit {
  let pts: Point[] = [];
  return {
    add: (p) => void pts.push(p),
    undo: () => void pts.pop(),
    close() {
      if (pts.length < 3) return null;
      const done = pts;
      pts = [];
      return done;
    },
    cancel: () => void (pts = []),
    points: () => pts.slice(),
  };
}

function bounds(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return {
    x,
    y,
    width: Math.ceil(Math.max(...xs)) - x,
    height: Math.ceil(Math.max(...ys)) - y,
  };
}

function commit(api: EditorApi, points: Point[], e: { shiftKey: boolean; altKey: boolean }): void {
  const rect = bounds(points);
  if (rect.width > 0 && rect.height > 0) {
    finishShape(api, polygonMask(points, rect), rect, opFromEvent(e, selectOptions(api).mode));
  }
  api.requestRender();
}

function outline(ctx: CanvasRenderingContext2D, view: ViewTransform, points: Point[]): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = apply(view.docToScreen, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.restore();
}

const freehand = new WeakMap<EditorApi, { edit: PolygonEdit; e: PointerEvent }>();

export const lassoTool: ToolSpec = {
  id: "select.lasso",
  label: "image.select.lasso",
  icon: LassoGlyph,
  key: "L",
  slot: "lasso",
  cursor: "crosshair",
  panel: SelectPanel,
  onPointerDown(p, e, api) {
    const edit = createPolygonEdit();
    edit.add(p);
    freehand.set(api, { edit, e });
  },
  onPointerMove(p, e, api) {
    const f = freehand.get(api);
    if (!f) return;
    f.edit.add(p);
    freehand.set(api, { edit: f.edit, e });
    api.requestRender();
  },
  onPointerUp(p, e, api) {
    const f = freehand.get(api);
    freehand.delete(api);
    if (!f) return;
    f.edit.add(p);
    const points = f.edit.close();
    if (points) commit(api, points, f.e);
    else api.requestRender();
  },
  onDeactivate: (api) => void freehand.delete(api),
  drawOverlay(ctx, view, api) {
    const f = freehand.get(api);
    if (f) outline(ctx, view, f.edit.points());
  },
};

type Poly = { edit: PolygonEdit; cursor: Point | null; last: { t: number; p: Point } | null };
const polys = new WeakMap<EditorApi, Poly>();

function poly(api: EditorApi): Poly {
  let s = polys.get(api);
  if (!s) {
    s = { edit: createPolygonEdit(), cursor: null, last: null };
    polys.set(api, s);
  }
  return s;
}

function closePolygon(api: EditorApi, e: { shiftKey: boolean; altKey: boolean }): void {
  const s = poly(api);
  const points = s.edit.close();
  s.last = null;
  if (points) commit(api, points, e);
  else api.requestRender();
}

export const polygonLassoTool: ToolSpec = {
  id: "select.polygon",
  label: "image.select.polygon",
  icon: PolygonLassoGlyph,
  key: "L",
  slot: "lasso",
  cursor: "crosshair",
  panel: SelectPanel,
  onPointerDown(p, e, api) {
    const s = poly(api);
    const last = s.last;
    if (last && e.timeStamp - last.t < 400 && Math.hypot(p.x - last.p.x, p.y - last.p.y) < 5) {
      closePolygon(api, e);
      return;
    }
    s.edit.add(p);
    s.last = { t: e.timeStamp, p };
    api.requestRender();
  },
  onPointerMove(p, _e, api) {
    const s = poly(api);
    if (s.edit.points().length === 0) return;
    s.cursor = p;
    api.requestRender();
  },
  onKeyDown(e, api) {
    const s = poly(api);
    if (s.edit.points().length === 0) return false;
    if (e.key === "Enter") closePolygon(api, e);
    else if (e.key === "Backspace") s.edit.undo();
    else if (e.key === "Escape") s.edit.cancel();
    else return false;
    api.requestRender();
    return true;
  },
  onDeactivate(api) {
    poly(api).edit.cancel();
  },
  drawOverlay(ctx, view, api) {
    const s = poly(api);
    const pts = s.edit.points();
    outline(ctx, view, s.cursor && pts.length > 0 ? [...pts, s.cursor] : pts);
  },
};
