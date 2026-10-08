// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerTransform.swift: handle positions, Shift keeps proportions, Option scales from the center, snap distance 10), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { EditorApi, Layer, LayerId, Mat2D, Point, ToolSpec } from "../api";
import { viewportOf } from "../canvas";
import { setTransform } from "../doc/commands/index";
import { isVisibleInTree } from "../doc/tree";
import { MoveIcon } from "../glyphs";
import { isFolder } from "../layer-ops";
import { selectionProvider } from "../registry";
import { snapOffset } from "./snap";
import {
  boundsOf,
  contains,
  type DragMode,
  dragTo,
  endTransform,
  HANDLES,
  pointOf,
  transformTarget,
} from "./transform-drag";
import { TransformPanel } from "./transform-panel";

type Transform = Layer["transform"];
type Drag =
  | { kind: "selection" }
  | {
      kind: "layer";
      id: LayerId;
      original: Transform;
      start: Point;
      mode: DragMode;
      moved: boolean;
      guides: { x: number | null; y: number | null };
    };

/** Hit radius of a handle and snap distance, in screen px. */
const HANDLE_PX = 6;
const ROTATE_PX = 24;
const SNAP_PX = 10;
const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const drags = new WeakMap<EditorApi, Drag>();

const zoomOf = (api: EditorApi) => viewportOf(api)?.view().zoom ?? 1;
const moveHooks = (api: EditorApi) =>
  api.selection() === null ? undefined : selectionProvider()?.move;

/** The rotate handle: above the top edge's middle, ROTATE_PX on screen. */
function rotateHandle(t: Transform, zoom: number): Point {
  const top = pointOf(t, HANDLES[1]);
  const c = pointOf(t, { x: 0.5, y: 0.5 });
  const len = Math.hypot(top.x - c.x, top.y - c.y) || 1;
  const k = ROTATE_PX / zoom / len;
  return { x: top.x + (top.x - c.x) * k, y: top.y + (top.y - c.y) * k };
}

function modeAt(t: Transform, p: Point, zoom: number): DragMode {
  const r = HANDLE_PX / zoom;
  const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) <= r;
  if (near(rotateHandle(t, zoom))) return { kind: "rotate" };
  const handle = HANDLES.findIndex((u) => near(pointOf(t, u)));
  if (handle >= 0) return { kind: "resize", handle };
  return contains(t, p) ? { kind: "move" } : { kind: "rotate" };
}

/** Edges and centers of the canvas and of every other visible layer with pixels. */
function snapTargets(api: EditorApi, id: LayerId): { xs: number[]; ys: number[] } {
  const m = api.doc().manifest;
  const xs = [0, m.width / 2, m.width];
  const ys = [0, m.height / 2, m.height];
  for (const l of m.layers) {
    if (l.id === id || isFolder(l) || l.adjustment !== undefined || !isVisibleInTree(m, l.id))
      continue;
    const b = boundsOf(l.transform);
    xs.push(b.x, b.x + b.width / 2, b.x + b.width);
    ys.push(b.y, b.y + b.height / 2, b.y + b.height);
  }
  return { xs, ys };
}

const hit = (edges: number[], list: number[]) =>
  list.find((v) => edges.some((e) => Math.abs(e - v) < 1e-6)) ?? null;

/** `t` snapped by its upright bounds; the target lines it landed on. */
function snapped(api: EditorApi, id: LayerId, t: Transform, zoom: number) {
  const targets = snapTargets(api, id);
  const b = boundsOf(t);
  const d = snapOffset(b, targets, SNAP_PX / zoom);
  const x = b.x + d.x;
  const y = b.y + d.y;
  return {
    t: { ...t, origin: [t.origin[0] + d.x, t.origin[1] + d.y] } satisfies Transform,
    guides: {
      x: hit([x, x + b.width / 2, x + b.width], targets.xs),
      y: hit([y, y + b.height / 2, y + b.height], targets.ys),
    },
  };
}

const screen = (m: Mat2D, p: Point): Point => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

function strokeTwice(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
}

export const transformTool: ToolSpec = {
  id: "move",
  label: "image.tools.move",
  icon: MoveIcon,
  cursor: "move",
  key: "V",
  panel: TransformPanel,
  onPointerDown(p, e, api) {
    const move = moveHooks(api);
    if (move) {
      drags.set(api, { kind: "selection" });
      return move.onPointerDown?.(p, e, api);
    }
    const layer = transformTarget(api);
    if (!layer) return;
    const mode = modeAt(layer.transform, p, zoomOf(api));
    const guides = { x: null, y: null };
    drags.set(api, {
      kind: "layer",
      id: layer.id,
      original: layer.transform,
      start: p,
      mode,
      moved: false,
      guides,
    });
  },
  onPointerMove(p, e, api) {
    const drag = drags.get(api);
    if (drag?.kind === "selection") return selectionProvider()?.move?.onPointerMove?.(p, e, api);
    if (!drag) return;
    let next = dragTo(drag.original, drag.start, drag.mode, p, {
      shift: e.shiftKey,
      alt: e.altKey,
    });
    drag.guides = { x: null, y: null };
    if (drag.mode.kind === "move") {
      const s = snapped(api, drag.id, next, zoomOf(api));
      next = s.t;
      drag.guides = s.guides;
    }
    drag.moved = true;
    api.dispatch(setTransform(drag.id, next));
  },
  onPointerUp(p, e, api) {
    const drag = drags.get(api);
    drags.delete(api);
    if (drag?.kind === "selection") return selectionProvider()?.move?.onPointerUp?.(p, e, api);
    if (drag?.moved) endTransform(api, drag.id, drag.original);
    api.requestRender();
  },
  onKeyDown(e, api) {
    const move = moveHooks(api);
    if (move?.onKeyDown?.(e, api)) return true;
    const dir = ARROWS[e.key];
    const layer = transformTarget(api);
    if (!dir || !layer || e.metaKey || e.ctrlKey || e.altKey) return false;
    const step = e.shiftKey ? 10 : 1;
    const t = layer.transform;
    const origin: [number, number] = [t.origin[0] + dir.x * step, t.origin[1] + dir.y * step];
    api.dispatch(setTransform(layer.id, { ...t, origin }));
    endTransform(api, layer.id, t);
    return true;
  },
  drawOverlay(ctx, view, api) {
    const move = moveHooks(api);
    if (move?.drawOverlay) return move.drawOverlay(ctx, view, api);
    const layer = transformTarget(api);
    if (!layer) return;
    const t = layer.transform;
    const m = view.docToScreen;
    const corners = [0, 2, 4, 6].map((i) => screen(m, pointOf(t, HANDLES[i])));
    const top = screen(m, pointOf(t, HANDLES[1]));
    const knob = screen(m, rotateHandle(t, view.zoom));
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(knob.x, knob.y);
    strokeTwice(ctx);
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, 4, 0, Math.PI * 2);
    for (const u of HANDLES) {
      const h = screen(m, pointOf(t, u));
      ctx.rect(h.x - 4, h.y - 4, 8, 8);
    }
    ctx.fillStyle = "#fff";
    ctx.fill();
    strokeTwice(ctx);
    const drag = drags.get(api);
    if (drag?.kind !== "layer") return;
    const { width, height } = api.doc().manifest;
    ctx.beginPath();
    if (drag.guides.x !== null) {
      const a = screen(m, { x: drag.guides.x, y: 0 });
      const b = screen(m, { x: drag.guides.x, y: height });
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    if (drag.guides.y !== null) {
      const a = screen(m, { x: 0, y: drag.guides.y });
      const b = screen(m, { x: width, y: drag.guides.y });
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#f0f";
    ctx.stroke();
  },
  onDeactivate(api) {
    drags.delete(api);
    selectionProvider()?.move?.onDeactivate?.(api);
  },
};
