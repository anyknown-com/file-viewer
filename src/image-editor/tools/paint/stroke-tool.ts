import { toViewerError } from "../../../contract/errors";
import type {
  EditorApi,
  LayerId,
  LayerResize,
  MessageKey,
  PixelTarget,
  PixelTile,
  Point,
  Rect,
  ToolSpec,
  ViewTransform,
} from "../../api";
import { apply, targetMatrix } from "../geom";
import { setToolState, toolState, type ToolState } from "../state";
import { createTileTracker, type TileTracker } from "../tiles";
import { ensurePaintable } from "./ensure-target";
import { createStrokeBuffer } from "./stroke-buffer";
import { catmullRom, createLazyRope, spacing, straightLine } from "./stroke-path";

/** New pixels for `rect` (target pixels) from its pixels before the stroke and the stroke's coverage. */
export type Mix = (base: Uint8Array, cov: Uint8Array, rect: Rect) => Uint8Array;

export type StrokeSpec = Pick<ToolSpec, "id" | "label" | "icon" | "key" | "panel"> & {
  commitLabel: MessageKey;
  /** Alt + pointer down instead of a stroke. Without it, Alt paints as usual. */
  onAlt?(p: Point, api: EditorApi): void;
  /** Checked at pointer down, before the target is prepared; false starts no stroke. */
  ready?(api: EditorApi): boolean;
  /** Runs once the target is ready; `first` is where the stroke starts (document space). */
  start(api: EditorApi, t: { id: LayerId; target: PixelTarget }, first: Point): Mix;
  /** Draws on top of the brush rings. */
  overlay?(
    ctx: CanvasRenderingContext2D,
    view: ViewTransform,
    api: EditorApi,
    cursor: Point,
    stroking: boolean,
  ): void;
};

type Stroke = {
  id: string;
  target: PixelTarget;
  resizes: LayerResize[];
  buffer: ReturnType<typeof createStrokeBuffer>;
  tracker: TileTracker;
  rope: ReturnType<typeof createLazyRope>;
  toPx: (p: Point) => Point;
  brush: ToolState["brush"];
  mix: Mix;
  ctrl: Point[]; // target pixels
  sample: Point; // where the last segment ended
  carry: number; // distance travelled since `sample`
  drew: boolean;
  end: Point; // document space
};

type Pending = { points: Point[]; fixed: number; ended: boolean }; // `fixed` leading points skip the rope
type State = {
  cursor: Point | null;
  lastEnd: Point | null;
  pending: Pending | null;
  stroke: Stroke | null;
};

const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

function union(a: Rect | null, b: Rect): Rect {
  if (!a || a.width === 0 || a.height === 0) return b;
  if (b.width === 0 || b.height === 0) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.max(a.x + a.width, b.x + b.width) - x;
  const h = Math.max(a.y + a.height, b.y + b.height) - y;
  return { x, y, width: w, height: h };
}

/** The pixels of `rect` before the stroke, pieced together from the tracker's tiles. */
function before(tiles: readonly PixelTile[], rect: Rect, bpp: number): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height * bpp);
  for (const t of tiles) {
    const x0 = Math.max(rect.x, t.x);
    const x1 = Math.min(rect.x + rect.width, t.x + t.width);
    for (let y = Math.max(rect.y, t.y); y < Math.min(rect.y + rect.height, t.y + t.height); y++) {
      if (x1 <= x0) break;
      const src = ((y - t.y) * t.width + (x0 - t.x)) * bpp;
      out.set(
        t.before.subarray(src, src + (x1 - x0) * bpp),
        ((y - rect.y) * rect.width + (x0 - rect.x)) * bpp,
      );
    }
  }
  return out;
}

/** Adds a control point and returns the segments, `spacing` apart, along the new curve piece. */
function advance(s: Stroke, q: Point): [Point, Point][] {
  s.ctrl.push(q);
  const pts = s.ctrl.slice(-3);
  if (pts.length < 2) return [];
  const poly = catmullRom(pts);
  const piece = poly.slice(poly.indexOf(pts[pts.length - 2]!));
  const step = spacing(s.brush.size);
  const out: [Point, Point][] = [];
  for (let i = 1; i < piece.length; i++) {
    const a = piece[i - 1]!;
    const b = piece[i]!;
    const len = dist(a, b);
    if (len === 0) continue;
    let pos = step - s.carry; // the next sample is this far along a→b
    for (; pos <= len; pos += step) {
      const p = { x: a.x + ((b.x - a.x) * pos) / len, y: a.y + ((b.y - a.y) * pos) / len };
      out.push([s.sample, p]);
      s.sample = p;
    }
    s.carry = len - (pos - step);
  }
  return out;
}

function paint(api: EditorApi, s: Stroke, segments: [Point, Point][]): void {
  let rect: Rect | null = null;
  for (const [a, b] of segments) {
    rect = union(rect, s.buffer.segment(a, b, s.brush.size, s.brush.hardness));
    s.drew = true;
  }
  if (!rect || rect.width === 0 || rect.height === 0) return;
  s.tracker.touch(rect);
  const base = before(s.tracker.tiles(), rect, s.target === "mask" ? 1 : 4);
  api.writeRegion(s.id, s.target, rect, s.mix(base, s.buffer.read(rect), rect));
}

function feed(api: EditorApi, s: Stroke, p: Point, rope: boolean): void {
  const q = rope ? s.rope.push(p) : p;
  if (!q) return;
  if (!rope) s.rope.reset(p);
  s.end = q;
  paint(api, s, advance(s, s.toPx(q)));
}

function finish(api: EditorApi, spec: StrokeSpec, state: State, s: Stroke): void {
  const last = s.ctrl[s.ctrl.length - 1]!;
  if (!s.drew || dist(s.sample, last) > 0) paint(api, s, [[s.sample, last]]);
  api.commit(spec.commitLabel, api.doc(), s.tracker.tiles(), s.resizes);
  s.buffer.dispose();
  state.stroke = null;
  state.lastEnd = s.end;
}

async function begin(
  api: EditorApi,
  spec: StrokeSpec,
  state: State,
  pending: Pending,
): Promise<void> {
  const t = await ensurePaintable(api, { grow: true });
  state.pending = null;
  if (!t) return;
  const { brush } = toolState(api);
  const m = targetMatrix(api, t.id, t.target);
  const first = pending.points[0]!;
  const q = apply(m, first);
  const s: Stroke = {
    ...t,
    buffer: createStrokeBuffer(api, t.id, t.target),
    tracker: createTileTracker(api, t.id, t.target),
    rope: createLazyRope(brush.smoothing * 100),
    toPx: (p) => apply(m, p),
    brush,
    mix: spec.start(api, t, first),
    ctrl: [q],
    sample: q,
    carry: 0,
    drew: false,
    end: first,
  };
  s.rope.reset(first);
  state.stroke = s;
  for (const [i, p] of pending.points.entries()) if (i > 0) feed(api, s, p, i >= pending.fixed);
  if (pending.ended) finish(api, spec, state, s);
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** `[` / `]` size (Shift: hardness) and 1–0 opacity, as in Photoshop. */
export function brushKey(e: KeyboardEvent, api: EditorApi): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const { brush } = toolState(api);
  const dir = e.code === "BracketRight" ? 1 : e.code === "BracketLeft" ? -1 : 0;
  if (dir !== 0 && e.shiftKey) {
    setToolState(api, { brush: { ...brush, hardness: clamp(brush.hardness + dir * 0.25, 0, 1) } });
  } else if (dir !== 0) {
    const scaled = Math.round(brush.size * (dir > 0 ? 1.1 : 0.9));
    const size = dir > 0 ? Math.max(scaled, brush.size + 1) : Math.min(scaled, brush.size - 1);
    setToolState(api, { brush: { ...brush, size: clamp(size, 1, 2100) } });
  } else {
    const digit = /^Digit(\d)$/.exec(e.code)?.[1];
    if (digit === undefined || e.shiftKey) return false;
    setToolState(api, { brush: { ...brush, opacity: digit === "0" ? 1 : Number(digit) / 10 } });
  }
  api.requestRender();
  return true;
}

export function ring(ctx: CanvasRenderingContext2D, c: Point, r: number): void {
  ctx.beginPath();
  ctx.arc(c.x, c.y, Math.max(r, 0.5), 0, Math.PI * 2);
  ctx.setLineDash([]);
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "#000";
  ctx.stroke();
}

/**
 * A tool that paints one stroke buffer per drag (brush, eraser, clone stamp). Each pointer move
 * adds coverage and writes the moved-over pixels once, mixed by `spec.start`'s `Mix` from the
 * pixels before the stroke; pointer up commits the stroke as one undo step.
 */
export function createStrokeTool(spec: StrokeSpec): ToolSpec {
  const states = new WeakMap<EditorApi, State>();
  const stateOf = (api: EditorApi): State => {
    let s = states.get(api);
    if (!s) {
      s = { cursor: null, lastEnd: null, pending: null, stroke: null };
      states.set(api, s);
    }
    return s;
  };
  return {
    id: spec.id,
    label: spec.label,
    icon: spec.icon,
    key: spec.key,
    cursor: "none",
    panel: spec.panel,
    onPointerDown(p, e, api) {
      const state = stateOf(api);
      if (state.pending || state.stroke) return;
      if (spec.onAlt && e.altKey) {
        spec.onAlt(p, api);
        api.requestRender();
        return;
      }
      if (spec.ready && !spec.ready(api)) return;
      const line = e.shiftKey && state.lastEnd ? straightLine(state.lastEnd, p) : [p];
      const pending: Pending = { points: line, fixed: line.length, ended: false };
      state.pending = pending;
      begin(api, spec, state, pending).catch((error: unknown) => {
        state.pending = null;
        state.stroke?.buffer.dispose();
        state.stroke = null;
        api.showError(toViewerError(error, "render_failed"));
      });
    },
    onPointerMove(p, _e, api) {
      const state = stateOf(api);
      state.cursor = p;
      if (state.pending) state.pending.points.push(p);
      else if (state.stroke) feed(api, state.stroke, p, true);
      api.requestRender();
    },
    onPointerUp(p, _e, api) {
      const state = stateOf(api);
      if (state.pending) {
        state.pending.points.push(p);
        state.pending.ended = true;
      } else if (state.stroke) {
        feed(api, state.stroke, p, true);
        finish(api, spec, state, state.stroke);
      }
    },
    onKeyDown: brushKey,
    onDeactivate(api) {
      const state = stateOf(api);
      if (state.stroke) finish(api, spec, state, state.stroke);
      state.cursor = null;
    },
    drawOverlay(ctx: CanvasRenderingContext2D, view: ViewTransform, api: EditorApi) {
      const { cursor, pending, stroke } = stateOf(api);
      if (!cursor) return;
      const { size, hardness } = toolState(api).brush;
      const c = apply(view.docToScreen, cursor);
      const r = (size / 2) * view.zoom;
      ctx.save();
      ctx.lineWidth = 1;
      ring(ctx, c, r);
      if (hardness < 1) ring(ctx, c, r * hardness);
      spec.overlay?.(ctx, view, api, cursor, pending !== null || stroke !== null);
      ctx.restore();
    },
  };
}
