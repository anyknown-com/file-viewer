// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/FloatingSelection.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { EditorApi, LayerId, Mat2D, Point, Rect, SelectionProvider } from "../../api";
import { apply, docRectToLayer, invert, layerPixelSize, multiply } from "../geom";
import { setToolState } from "../state";
import { createTileTracker } from "../tiles";
import { selectionBounds, selectionOf, readSelection, writeSelection } from "./mask";
import { selectionInLayer } from "./mask-sample";
import { clampRect, resampleRef, scaleAlpha, sourceOver } from "./resample";

export { resampleRef };

export type Float = {
  layer: LayerId;
  srcRect: Rect;
  original: Uint8Array;
  sel: Uint8Array;
  pixels: Uint8Array;
  width: number;
  height: number;
  transform: Mat2D;
  duplicate: boolean;
  dx: number;
  dy: number;
  scale: number;
  angle: number;
  canvas: OffscreenCanvas | null;
};

const floats = new WeakMap<EditorApi, Float>();

/** The floating pixels of this editor, or null. */
export function floating(api: EditorApi): Float | null {
  return floats.get(api) ?? null;
}

const notify = (api: EditorApi): void => setToolState(api, {});

/** Lifts the selected pixels of the active layer; false when there is nothing to lift. */
export function beginFloat(api: EditorApi, opts: { duplicate: boolean }): boolean {
  const { active, target } = api.session();
  const bounds = selectionBounds(api);
  if (target === "mask" || active === null || bounds === null) return false;
  const size = layerPixelSize(api, active, "image");
  const srcRect = clampRect(docRectToLayer(api, active, bounds), size.width, size.height);
  if (srcRect.width === 0 || srcRect.height === 0) return false;
  const original = api.readRegion(active, "image", srcRect);
  const sel = selectionInLayer(api, active, srcRect);
  const f: Float = {
    layer: active,
    srcRect,
    original,
    sel,
    pixels: scaleAlpha(original, (i) => sel[i]),
    width: srcRect.width,
    height: srcRect.height,
    transform: [1, 0, 0, 1, srcRect.x, srcRect.y],
    duplicate: opts.duplicate,
    dx: 0,
    dy: 0,
    scale: 1,
    angle: 0,
    canvas: null,
  };
  if (!opts.duplicate)
    api.writeRegion(
      active,
      "image",
      srcRect,
      scaleAlpha(original, (i) => 255 - sel[i]),
    );
  floats.set(api, f);
  notify(api);
  api.requestRender();
  return true;
}

const t = (x: number, y: number): Mat2D => [1, 0, 0, 1, x, y];

function retransform(api: EditorApi, f: Float): void {
  const cx = f.width / 2;
  const cy = f.height / 2;
  const a = (f.angle * Math.PI) / 180;
  const rot: Mat2D = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
  const scale: Mat2D = [f.scale, 0, 0, f.scale, 0, 0];
  f.transform = multiply(
    t(f.srcRect.x + cx + f.dx, f.srcRect.y + cy + f.dy),
    multiply(rot, multiply(scale, t(-cx, -cy))),
  );
  notify(api);
  api.requestRender();
}

/** Moves the floating pixels by (dx, dy) layer pixels. */
export function moveFloat(api: EditorApi, dx: number, dy: number): void {
  const f = floats.get(api);
  if (!f) return;
  f.dx += dx;
  f.dy += dy;
  retransform(api, f);
}

export function setFloatScale(api: EditorApi, s: number): void {
  const f = floats.get(api);
  if (!f) return;
  f.scale = s;
  retransform(api, f);
}

export function setFloatAngle(api: EditorApi, deg: number): void {
  const f = floats.get(api);
  if (!f) return;
  f.angle = deg;
  retransform(api, f);
}

export function cancelFloat(api: EditorApi): void {
  const f = floats.get(api);
  if (!f) return;
  floats.delete(api);
  api.writeRegion(f.layer, "image", f.srcRect, f.original);
  notify(api);
  api.requestRender();
}

/** The layer-pixel offset that a document-space offset amounts to. */
export function docDeltaToLayer(api: EditorApi, id: LayerId, d: Point): Point {
  const m = api.layerMatrix(id);
  return { x: m[0] * d.x + m[2] * d.y, y: m[1] * d.x + m[3] * d.y };
}

function bounding(m: Mat2D, w: number, h: number): Rect {
  const c = [
    apply(m, { x: 0, y: 0 }),
    apply(m, { x: w, y: 0 }),
    apply(m, { x: 0, y: h }),
    apply(m, { x: w, y: h }),
  ];
  const x0 = Math.floor(Math.min(...c.map((p) => p.x)));
  const y0 = Math.floor(Math.min(...c.map((p) => p.y)));
  return {
    x: x0,
    y: y0,
    width: Math.ceil(Math.max(...c.map((p) => p.x))) - x0,
    height: Math.ceil(Math.max(...c.map((p) => p.y))) - y0,
  };
}

/** Puts the floating pixels down as one undo step and moves the selection with them. */
export function commitFloat(api: EditorApi): void {
  const f = floats.get(api);
  if (!f) return;
  if (f.dx === 0 && f.dy === 0 && f.scale === 1 && f.angle === 0) {
    cancelFloat(api);
    return;
  }
  floats.delete(api);
  const id = f.layer;
  api.writeRegion(id, "image", f.srcRect, f.original);
  const size = layerPixelSize(api, id, "image");
  const dst = clampRect(bounding(f.transform, f.width, f.height), size.width, size.height);
  const tracker = createTileTracker(api, id, "image");
  tracker.touch(f.srcRect);
  tracker.touch(dst);
  if (!f.duplicate) {
    api.writeRegion(
      id,
      "image",
      f.srcRect,
      scaleAlpha(f.original, (i) => 255 - f.sel[i]),
    );
  }
  if (dst.width > 0 && dst.height > 0) {
    const below = api.readRegion(id, "image", dst);
    const over = resampleRef(
      { width: f.width, height: f.height, data: f.pixels },
      f.transform,
      dst,
    );
    api.writeRegion(id, "image", dst, sourceOver(below, over));
  }
  api.commit("image.select.move", api.doc(), tracker.tiles());
  const inv = invert(api.layerMatrix(id));
  const o = apply(inv, { x: 0, y: 0 });
  const d = apply(inv, { x: f.dx, y: f.dy });
  const { width, height } = selectionOf(api);
  writeSelection(
    api,
    readSelection(api),
    { x: Math.round(d.x - o.x), y: Math.round(d.y - o.y), width, height },
    "replace",
  );
  notify(api);
  api.requestRender();
}

/** The floating pixels and a dashed frame, drawn over the canvas. */
export function floatOverlay(
  ctx: CanvasRenderingContext2D,
  view: { docToScreen: Mat2D },
  api: EditorApi,
): void {
  const f = floats.get(api);
  if (!f) return;
  if (!f.canvas) {
    f.canvas = new OffscreenCanvas(f.width, f.height);
    const c = f.canvas.getContext("2d");
    c?.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.width, f.height), 0, 0);
  }
  const m = multiply(view.docToScreen, multiply(invert(api.layerMatrix(f.layer)), f.transform));
  ctx.save();
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(f.canvas, 0, 0);
  ctx.restore();
  const pts = [
    [0, 0],
    [f.width, 0],
    [f.width, f.height],
    [0, f.height],
  ].map(([x, y]) => apply(m, { x, y }));
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#000";
  ctx.stroke();
}

type Drag = { start: Point; applied: Point };
const drags = new WeakMap<EditorApi, Drag>();

/** Layer-pixel step that a document offset amounts to, rounded; applies what is not yet applied. */
function dragTo(api: EditorApi, f: Float, d: Drag, p: Point): void {
  const l = docDeltaToLayer(api, f.layer, { x: p.x - d.start.x, y: p.y - d.start.y });
  const total = { x: Math.round(l.x), y: Math.round(l.y) };
  moveFloat(api, total.x - d.applied.x, total.y - d.applied.y);
  d.applied = total;
}

const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** Enter puts the floating pixels down, Esc takes them back. */
export function floatKey(e: KeyboardEvent, api: EditorApi): boolean {
  if (!floats.has(api)) return false;
  if (e.key === "Enter") commitFloat(api);
  else if (e.key === "Escape") cancelFloat(api);
  else return false;
  return true;
}

/** What the move tool does with the pointer while there is a selection. */
export const selectionMove: NonNullable<SelectionProvider["move"]> = {
  onPointerDown(p, e, api) {
    if (!floats.has(api) && !beginFloat(api, { duplicate: e.altKey })) return;
    drags.set(api, { start: p, applied: { x: 0, y: 0 } });
  },
  onPointerMove(p, _e, api) {
    const f = floats.get(api);
    const d = drags.get(api);
    if (f && d) dragTo(api, f, d, p);
  },
  onPointerUp(p, _e, api) {
    const f = floats.get(api);
    const d = drags.get(api);
    drags.delete(api);
    if (f && d) dragTo(api, f, d, p);
  },
  onKeyDown(e, api) {
    if (floatKey(e, api)) return true;
    const arrow = ARROWS[e.key];
    if (!arrow) return false;
    if (!floats.has(api) && !beginFloat(api, { duplicate: false })) return false;
    const f = floats.get(api);
    if (!f) return false;
    const step = e.shiftKey ? 10 : 1;
    const l = docDeltaToLayer(api, f.layer, { x: arrow.x * step, y: arrow.y * step });
    moveFloat(api, Math.round(l.x), Math.round(l.y));
    return true;
  },
  drawOverlay: floatOverlay,
  onDeactivate(api) {
    drags.delete(api);
    if (floats.has(api)) commitFloat(api);
  },
};
