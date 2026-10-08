// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/CloneStamp.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import { useSyncExternalStore } from "react";
import { useT } from "../../../i18n/use-t";
import { Switch } from "../../../primitives/switch";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type { EditorApi, Mat2D, Point, ToolSpec } from "../../api";
import { apply, invert, layerPixelSize, multiply, targetMatrix } from "../geom";
import { CloneGlyph } from "../glyphs";
import { selectPaintMessages } from "../messages";
import { toolState } from "../state";
import { PaintPanel } from "./paint-panel";
import { createStrokeTool } from "./stroke-tool";

type Source = "layer" | "all";
type CloneState = {
  source: Point | null; // document space
  firstDest: Point | null; // where the stroke that fixed the offset started
  aligned: boolean;
  sample: Source;
  offset: Point | null; // the current or last stroke's offset
};

/**
 * The whole-pixel offset (document space, added to the brush to find the source) for a stroke
 * starting at `strokeStart`: aligned strokes keep the one `firstDest` fixed; otherwise every stroke
 * runs from its start to the source again.
 */
export function cloneOffset(
  state: { source: Point; firstDest: Point | null; aligned: boolean },
  strokeStart: Point,
): Point {
  const from = state.aligned && state.firstDest ? state.firstDest : strokeStart;
  return {
    x: Math.round(state.source.x - from.x),
    y: Math.round(state.source.y - from.y),
  };
}

/**
 * Source-over of each `src` pixel onto `base`, weighted by `cov / 255 × opacity`. RGBA straight
 * alpha, or R8 (mask) when `base` has one byte per coverage value.
 */
export function cloneOver(
  base: Uint8Array,
  cov: Uint8Array,
  src: Uint8Array,
  opacity: number,
): Uint8Array {
  const out = base.slice();
  const mask = base.length === cov.length;
  for (let i = 0; i < cov.length; i++) {
    const k = (cov[i]! / 255) * opacity;
    if (k <= 0) continue;
    if (mask) {
      out[i] = Math.round(base[i]! + (src[i]! - base[i]!) * k);
      continue;
    }
    const j = i * 4;
    const sa = (src[j + 3]! / 255) * k;
    if (sa <= 0) continue;
    const keep = (base[j + 3]! / 255) * (1 - sa);
    const oa = sa + keep;
    for (let c = 0; c < 3; c++)
      out[j + c] = Math.round((src[j + c]! * sa + base[j + c]! * keep) / oa);
    out[j + 3] = Math.round(oa * 255);
  }
  return out;
}

type Entry = { state: CloneState; listeners: Set<() => void> };
const entries = new WeakMap<EditorApi, Entry>();

function entry(api: EditorApi): Entry {
  let e = entries.get(api);
  if (!e) {
    e = {
      state: { source: null, firstDest: null, aligned: true, sample: "layer", offset: null },
      listeners: new Set(),
    };
    entries.set(api, e);
  }
  return e;
}

export function cloneState(api: EditorApi): CloneState {
  return entry(api).state;
}

export function setCloneState(api: EditorApi, patch: Partial<CloneState>): void {
  const e = entry(api);
  e.state = { ...e.state, ...patch };
  for (const listener of e.listeners) listener();
}

function useCloneState(api: EditorApi): CloneState {
  const e = entry(api);
  return useSyncExternalStore(
    (onChange) => {
      e.listeners.add(onChange);
      return () => e.listeners.delete(onChange);
    },
    () => e.state,
  );
}

function ClonePanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const c = useCloneState(api);
  return (
    <>
      <PaintPanel api={api} />
      <Switch
        label={t("image.paint.cloneAligned")}
        checked={c.aligned}
        onCheckedChange={(aligned) => setCloneState(api, { aligned })}
      />
      <ToggleGroup<Source>
        label={t("image.paint.source")}
        value={c.sample}
        options={[
          { value: "layer", label: t("image.paint.sourceLayer") },
          { value: "all", label: t("image.paint.sourceAll") },
        ]}
        onChange={(sample) => setCloneState(api, { sample })}
      />
      {!c.source && <span>{t("image.paint.cloneNoSource")}</span>}
    </>
  );
}

function crosshair(ctx: CanvasRenderingContext2D, c: Point): void {
  ctx.beginPath();
  ctx.moveTo(c.x - 6, c.y);
  ctx.lineTo(c.x + 6, c.y);
  ctx.moveTo(c.x, c.y - 6);
  ctx.lineTo(c.x, c.y + 6);
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000";
  ctx.stroke();
}

export const cloneTool: ToolSpec = createStrokeTool({
  id: "paint.clone",
  label: "image.paint.clone",
  icon: CloneGlyph,
  key: "S",
  panel: ClonePanel,
  commitLabel: "image.paint.clone",
  onAlt: (p, api) => setCloneState(api, { source: p, firstDest: null }),
  ready: (api) => cloneState(api).source !== null,
  start(api, t, first) {
    const c = cloneState(api);
    const offset = cloneOffset({ ...c, source: c.source! }, first);
    setCloneState(api, { offset, firstDest: c.aligned && c.firstDest ? c.firstDest : first });
    // What the stroke copies from, taken now: the target's own pixels, or the canvas as shown.
    const m = targetMatrix(api, t.id, t.target);
    const shift = multiply([1, 0, 0, 1, offset.x, offset.y], invert(m));
    const all = c.sample === "all" && t.target === "image";
    const { width: w, height: h } = all ? api.doc().manifest : layerPixelSize(api, t.id, t.target);
    const rect = { x: 0, y: 0, width: w, height: h };
    const img = all ? api.readComposite(rect) : api.readRegion(t.id, t.target, rect);
    const s: Mat2D = all ? shift : multiply(m, shift); // target pixels → source pixels
    const bpp = t.target === "mask" ? 1 : 4;
    const { opacity } = toolState(api).brush;
    return (base, cov, r) => {
      const src = bpp === 1 ? base.slice() : new Uint8Array(base.length); // outside: no change
      for (let y = 0; y < r.height; y++) {
        const p = apply(s, { x: r.x + 0.5, y: r.y + y + 0.5 });
        for (let x = 0; x < r.width; x++) {
          const sx = Math.floor(p.x + s[0] * x);
          const sy = Math.floor(p.y + s[1] * x);
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const from = (sy * w + sx) * bpp;
          src.set(img.subarray(from, from + bpp), (y * r.width + x) * bpp);
        }
      }
      return cloneOver(base, cov, src, opacity);
    };
  },
  overlay(ctx, view, api, cursor, stroking) {
    const c = cloneState(api);
    if (!c.source) return;
    const o = stroking && c.offset ? c.offset : cloneOffset({ ...c, source: c.source }, cursor);
    crosshair(ctx, apply(view.docToScreen, { x: cursor.x + o.x, y: cursor.y + o.y }));
  },
});
