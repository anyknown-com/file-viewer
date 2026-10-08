import { useState } from "react";
import { toViewerError } from "../../../contract/errors";
import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import { NumberField } from "../../../primitives/number-field";
import { Progress } from "../../../primitives/progress";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type { EditorApi, LayerId, Point, Rect, ToolSpec } from "../../api";
import { apply, layerPixelSize, targetMatrix } from "../geom";
import { HealGlyph } from "../glyphs";
import { selectPaintMessages } from "../messages";
import { ensurePaintable } from "../paint/ensure-target";
import { RasterizeAsk } from "../paint/paint-panel";
import { createStrokeBuffer } from "../paint/stroke-buffer";
import { brushKey, ring } from "../paint/stroke-tool";
import { runJob, setToolState, toolState, useToolState, type ToolState } from "../state";
import { createTileTracker } from "../tiles";
import { coverageBounds, type SpotHealInput } from "./spot-heal";

type HealMode = SpotHealInput["mode"];
const modes = new WeakMap<EditorApi, HealMode>();
export const healMode = (api: EditorApi): HealMode => modes.get(api) ?? "contentAware";
export const setHealMode = (api: EditorApi, mode: HealMode): void => void modes.set(api, mode);

type Stroke = {
  id: LayerId;
  buffer: ReturnType<typeof createStrokeBuffer>;
  toPx: (p: Point) => Point;
  drawn: number; // points already in the buffer
  rect: Rect | null; // what the segments covered, layer pixels
};
type State = {
  cursor: Point | null;
  points: Point[] | null; // the drag, document space; null when no stroke is under way
  end: (() => void) | null; // ends the drag
  stroke: Stroke | null;
};

const states = new WeakMap<EditorApi, State>();
function stateOf(api: EditorApi): State {
  let s = states.get(api);
  if (!s) {
    s = { cursor: null, points: null, end: null, stroke: null };
    states.set(api, s);
  }
  return s;
}

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.max(a.x + a.width, b.x + b.width) - x;
  const h = Math.max(a.y + a.height, b.y + b.height) - y;
  return { x, y, width: w, height: h };
}

function draw(points: Point[], s: Stroke, brush: ToolState["brush"]): void {
  for (; s.drawn < points.length; s.drawn++) {
    const a = s.toPx(points[Math.max(0, s.drawn - 1)]!);
    const r = s.buffer.segment(a, s.toPx(points[s.drawn]!), brush.size, brush.hardness);
    if (r.width > 0 && r.height > 0) s.rect = union(s.rect, r);
  }
}

/**
 * The painted spot plus room for the patch search, which looks up to about three spot-widths
 * away (Compositor's reach), clipped to the layer; null when nothing was covered.
 */
function healRect(api: EditorApi, s: Stroke): Rect | null {
  if (!s.rect) return null;
  const [x0, y0, x1, y1] = coverageBounds(s.buffer.read(s.rect), s.rect.width, s.rect.height);
  if (x1 <= x0) return null;
  const reach = (Math.max(x1 - x0, y1 - y0) + 32) * 3.2;
  const { width, height } = layerPixelSize(api, s.id, "image");
  const x = Math.max(0, Math.floor(s.rect.x + x0 - reach));
  const y = Math.max(0, Math.floor(s.rect.y + y0 - reach));
  const right = Math.min(width, Math.ceil(s.rect.x + x1 + reach));
  const bottom = Math.min(height, Math.ceil(s.rect.y + y1 + reach));
  return { x, y, width: right - x, height: bottom - y };
}

async function heal(api: EditorApi, s: Stroke, changed: boolean): Promise<void> {
  const rect = healRect(api, s);
  const mask = rect ? s.buffer.read(rect) : null;
  s.buffer.dispose();
  const result =
    rect && mask
      ? await runJob(api, "image.paint.working", (signal) => {
          const input = {
            width: rect.width,
            height: rect.height,
            data: api.readRegion(s.id, "image", rect),
            mask,
            mode: healMode(api),
          };
          return api.runInWorker({ kind: "heal", input }, [input.data.buffer, mask.buffer], signal);
        })
      : null;
  if (!result || !rect) {
    if (changed) api.commit("image.paint.heal", api.doc(), []); // keep the rasterize undoable
    return;
  }
  const tracker = createTileTracker(api, s.id, "image");
  tracker.touch(rect);
  api.writeRegion(s.id, "image", rect, result);
  api.commit("image.paint.heal", api.doc(), tracker.tiles());
}

/** Prepares the layer, draws what was dragged so far, and heals once the drag has ended. */
async function begin(
  api: EditorApi,
  state: State,
  points: Point[],
  ended: Promise<void>,
): Promise<void> {
  const doc = api.doc();
  const t = await ensurePaintable(api, { grow: false });
  if (!t || t.target === "mask") return;
  const m = targetMatrix(api, t.id, "image");
  const s: Stroke = {
    id: t.id,
    buffer: createStrokeBuffer(api, t.id, "image"),
    toPx: (p) => apply(m, p),
    drawn: 0,
    rect: null,
  };
  state.stroke = s;
  draw(points, s, toolState(api).brush);
  await ended;
  await heal(api, s, api.doc() !== doc);
}

function HealPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const { brush, job } = useToolState(api);
  const [mode, setMode] = useState(() => healMode(api));
  const set = (patch: Partial<ToolState["brush"]>): void =>
    setToolState(api, { brush: { ...toolState(api).brush, ...patch } });
  return (
    <>
      <NumberField
        label={t("image.paint.size")}
        value={brush.size}
        min={1}
        max={2100}
        onChange={(size) => set({ size })}
      />
      <NumberField
        label={t("image.paint.hardness")}
        value={Math.round(brush.hardness * 100)}
        min={0}
        max={100}
        onChange={(v) => set({ hardness: v / 100 })}
      />
      <ToggleGroup<HealMode>
        label={t("image.paint.healMode")}
        value={mode}
        options={[
          { value: "contentAware", label: t("image.paint.healContentAware") },
          { value: "texture", label: t("image.paint.healTexture") },
        ]}
        onChange={(v) => {
          setHealMode(api, v);
          setMode(v);
        }}
      />
      {job && (
        <>
          <Progress label={t("image.paint.working")} value={null} />
          <Button onClick={() => job.abort()}>{t("image.paint.stop")}</Button>
        </>
      )}
      <RasterizeAsk api={api} />
    </>
  );
}

export const healTool: ToolSpec = {
  id: "paint.heal",
  label: "image.paint.heal",
  icon: HealGlyph,
  key: "J",
  cursor: "none",
  panel: HealPanel,
  onPointerDown(p, _e, api) {
    const state = stateOf(api);
    if (state.points || toolState(api).job) return;
    const layer = api.doc().manifest.layers.find((l) => l.id === api.session().active);
    if (api.session().target === "mask" || layer?.adjustment !== undefined) return;
    const points = [p];
    const ended = new Promise<void>((resolve) => (state.end = resolve));
    state.points = points;
    begin(api, state, points, ended)
      .catch((error: unknown) => api.showError(toViewerError(error, "render_failed")))
      .finally(() => {
        state.points = null;
        state.end = null;
        state.stroke = null;
        api.requestRender();
      });
  },
  onPointerMove(p, _e, api) {
    const state = stateOf(api);
    state.cursor = p;
    if (state.points && state.end) {
      state.points.push(p);
      if (state.stroke) draw(state.points, state.stroke, toolState(api).brush);
    }
    api.requestRender();
  },
  onPointerUp(p, e, api) {
    const state = stateOf(api);
    if (!state.points || !state.end) return;
    healTool.onPointerMove?.(p, e, api);
    state.end();
    state.end = null;
  },
  onKeyDown: brushKey,
  onDeactivate(api) {
    const state = stateOf(api);
    state.end?.();
    state.end = null;
    state.cursor = null;
  },
  drawOverlay(ctx, view, api) {
    const { cursor, points } = stateOf(api);
    const { size, hardness } = toolState(api).brush;
    const r = (size / 2) * view.zoom;
    ctx.save();
    if (points) {
      // The area to heal, as a red wash.
      const pts = points.map((q) => apply(view.docToScreen, q));
      ctx.fillStyle = ctx.strokeStyle = "rgba(255, 0, 0, 0.4)";
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.arc(pts[0]!.x, pts[0]!.y, Math.max(0.5, r), 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (const q of pts) ctx.lineTo(q.x, q.y);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(1, r * 2);
        ctx.stroke();
      }
    }
    if (cursor) {
      const c = apply(view.docToScreen, cursor);
      ctx.lineWidth = 1;
      ring(ctx, c, r);
      if (hardness < 1) ring(ctx, c, r * hardness);
    }
    ctx.restore();
  },
};
