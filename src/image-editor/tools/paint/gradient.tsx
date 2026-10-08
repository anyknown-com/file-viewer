import { useState } from "react";
import { toViewerError } from "../../../contract/errors";
import { useT } from "../../../i18n/use-t";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type {
  EditorApi,
  LayerId,
  LayerResize,
  PixelTarget,
  Point,
  ToolSpec,
  ViewTransform,
} from "../../api";
import { apply, invert, layerPixelSize, targetMatrix } from "../geom";
import { GradientGlyph } from "../glyphs";
import { selectPaintMessages } from "../messages";
import { selectionInLayer } from "../select/mask-sample";
import { toolState, type RGBA } from "../state";
import { createTileTracker } from "../tiles";
import { ColorSwatches } from "./color-swatches";
import { paintOver } from "./composite";
import { ensurePaintable } from "./ensure-target";

type Kind = "linear" | "radial";
type Stops = "fgBg" | "fgClear";
export type GradientOptions = { kind: Kind; stops: Stops };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Where `p` falls between `a` (0) and `b` (1): the projection on ab, or the distance from a over |ab|. */
export function gradientAt(kind: Kind, a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  if (kind === "radial") return clamp01(Math.hypot(p.x - a.x, p.y - a.y) / Math.sqrt(len2));
  return clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2);
}

export function lerpStop(t: number, from: RGBA, to: RGBA): RGBA {
  return from.map((v, i) => Math.round(v + (to[i]! - v) * t)) as RGBA;
}

/** `b` snapped to the nearest multiple of 45° around `a`. */
export function lock45(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const step = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  if (step % 4 === 0) return { x: b.x, y: a.y };
  if (step % 2 === 0) return { x: a.x, y: b.y };
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx) * m, y: a.y + Math.sign(dy) * m };
}

const options = new WeakMap<EditorApi, GradientOptions>();

export function gradientOptions(api: EditorApi): GradientOptions {
  return options.get(api) ?? { kind: "linear", stops: "fgBg" };
}

function setGradientOptions(api: EditorApi, patch: Partial<GradientOptions>): void {
  options.set(api, { ...gradientOptions(api), ...patch });
}

/** Fills the whole target with the gradient a → b (document space), weighted by the selection. */
function fill(
  api: EditorApi,
  { id, target, resizes }: { id: LayerId; target: PixelTarget; resizes: LayerResize[] },
  a: Point,
  b: Point,
): void {
  const { kind, stops } = gradientOptions(api);
  const { fg, bg } = toolState(api);
  const to: RGBA = stops === "fgBg" ? bg : [fg[0], fg[1], fg[2], 0];
  const { width, height } = layerPixelSize(api, id, target);
  const rect = { x: 0, y: 0, width, height };
  const tracker = createTileTracker(api, id, target);
  tracker.touch(rect);
  const base = api.readRegion(id, target, rect);
  const sel = selectionInLayer(api, id, rect, target);
  const m = invert(targetMatrix(api, id, target));
  const mask = target === "mask";
  const out = base.slice();
  const one = new Uint8Array(1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (sel[i] === 0) continue;
      const c = lerpStop(gradientAt(kind, a, b, apply(m, { x: x + 0.5, y: y + 0.5 })), fg, to);
      if (mask) {
        const w = (sel[i]! / 255) * (c[3] / 255);
        const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
        out[i] = Math.round(base[i]! + (lum - base[i]!) * w);
      } else {
        one[0] = sel[i]!;
        out.set(paintOver(base.subarray(i * 4, i * 4 + 4), one, c, 1), i * 4);
      }
    }
  }
  api.writeRegion(id, target, rect, out);
  api.commit("image.paint.gradient", api.doc(), tracker.tiles(), resizes);
}

async function run(api: EditorApi, a: Point, b: Point): Promise<void> {
  const t = await ensurePaintable(api, { grow: true });
  if (t) fill(api, t, a, b);
}

type Drag = { a: Point; b: Point };
const drags = new WeakMap<EditorApi, Drag>();

function GradientPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const [opts, setOpts] = useState(() => gradientOptions(api));
  const update = (patch: Partial<GradientOptions>): void => {
    setGradientOptions(api, patch);
    setOpts(gradientOptions(api));
  };
  return (
    <>
      <ColorSwatches api={api} />
      <ToggleGroup<Kind>
        label={t("image.paint.gradientType")}
        value={opts.kind}
        options={[
          { value: "linear", label: t("image.paint.gradientLinear") },
          { value: "radial", label: t("image.paint.gradientRadial") },
        ]}
        onChange={(kind) => update({ kind })}
      />
      <ToggleGroup<Stops>
        label={t("image.paint.gradientStops")}
        value={opts.stops}
        options={[
          { value: "fgBg", label: t("image.paint.stopsFgBg") },
          { value: "fgClear", label: t("image.paint.stopsFgClear") },
        ]}
        onChange={(stops) => update({ stops })}
      />
    </>
  );
}

export const gradientTool: ToolSpec = {
  id: "paint.gradient",
  label: "image.paint.gradient",
  icon: GradientGlyph,
  key: "G",
  cursor: "crosshair",
  panel: GradientPanel,
  onPointerDown(p, _e, api) {
    drags.set(api, { a: p, b: p });
  },
  onPointerMove(p, e, api) {
    const d = drags.get(api);
    if (!d) return;
    d.b = e.shiftKey ? lock45(d.a, p) : p;
    api.requestRender();
  },
  onPointerUp(p, e, api) {
    const d = drags.get(api);
    if (!d) return;
    drags.delete(api);
    const b = e.shiftKey ? lock45(d.a, p) : p;
    api.requestRender();
    if (Math.hypot(b.x - d.a.x, b.y - d.a.y) < 0.5) return;
    run(api, d.a, b).catch((error: unknown) =>
      api.showError(toViewerError(error, "render_failed")),
    );
  },
  onDeactivate(api) {
    drags.delete(api);
  },
  drawOverlay(ctx: CanvasRenderingContext2D, view: ViewTransform, api: EditorApi) {
    const d = drags.get(api);
    if (!d) return;
    const a = apply(view.docToScreen, d.a);
    const b = apply(view.docToScreen, d.b);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#000";
    ctx.stroke();
    ctx.restore();
  },
};
