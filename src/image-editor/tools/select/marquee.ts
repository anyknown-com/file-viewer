import type { EditorApi, Point, Rect, ToolSpec, ViewTransform } from "../../api";
import { isMac } from "../../shortcut";
import { EllipseMarqueeGlyph, RectMarqueeGlyph } from "../glyphs";
import { apply } from "../geom";
import { withFloat } from "./float-tool";
import { clickDeselect, finishShape } from "./finish";
import { opFromEvent, readSelection, selectionOf, selectOptions, writeSelection } from "./mask";
import { SelectPanel } from "./select-panel";

/** Shift locks a square (the longer side wins), Alt grows the box around `start`. */
export function marqueeRect(
  start: Point,
  end: Point,
  mods: { shift: boolean; alt: boolean },
): Rect {
  let dx = Math.round(end.x) - Math.round(start.x);
  let dy = Math.round(end.y) - Math.round(start.y);
  if (mods.shift) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = side * (dx < 0 ? -1 : 1);
    dy = side * (dy < 0 ? -1 : 1);
  }
  const sx = Math.round(start.x);
  const sy = Math.round(start.y);
  if (mods.alt) {
    return {
      x: sx - Math.abs(dx),
      y: sy - Math.abs(dy),
      width: Math.abs(dx) * 2,
      height: Math.abs(dy) * 2,
    };
  }
  return {
    x: Math.min(sx, sx + dx),
    y: Math.min(sy, sy + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}

/** An ellipse inscribed in `rect` as R8 (255 inside), with a 1 px anti-aliased edge. */
export function ellipseMask(rect: Rect): Uint8Array {
  const { width: w, height: h } = rect;
  const out = new Uint8Array(w * h);
  const a = w / 2;
  const b = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - a;
      const dy = y + 0.5 - b;
      const f = Math.hypot(dx / a, dy / b);
      if (f === 0) {
        out[y * w + x] = 255;
        continue;
      }
      const grad = Math.hypot(dx / (a * a), dy / (b * b)) / f;
      const distance = (f - 1) / grad;
      out[y * w + x] = Math.round(Math.min(1, Math.max(0, 0.5 - distance)) * 255);
    }
  }
  return out;
}

const isMod = (e: PointerEvent): boolean => (isMac() ? e.metaKey : e.ctrlKey);

type Drag =
  | { kind: "shape"; start: Point; end: Point; e: PointerEvent }
  | { kind: "move"; start: Point; base: Uint8Array };

function marquee(shape: "rect" | "ellipse"): ToolSpec {
  const drags = new WeakMap<EditorApi, Drag>();
  const rectOf = (d: Extract<Drag, { kind: "shape" }>): Rect =>
    marqueeRect(d.start, d.end, { shift: d.e.shiftKey, alt: d.e.altKey });
  const maskOf = (r: Rect): Uint8Array =>
    shape === "rect" ? new Uint8Array(r.width * r.height).fill(255) : ellipseMask(r);
  return {
    id: shape === "rect" ? "select.rect" : "select.ellipse",
    label: shape === "rect" ? "image.select.rect" : "image.select.ellipse",
    icon: shape === "rect" ? RectMarqueeGlyph : EllipseMarqueeGlyph,
    key: "M",
    slot: "marquee",
    cursor: "crosshair",
    panel: SelectPanel,
    onPointerDown(p, e, api) {
      if (isMod(e)) return; // Mod + drag moves pixels (P01-5)
      const { width, height } = selectionOf(api);
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      const inside = x >= 0 && y >= 0 && x < width && y < height;
      if (inside && !e.shiftKey && !e.altKey) {
        const base = readSelection(api);
        if (base[y * width + x] >= 128) {
          drags.set(api, { kind: "move", start: p, base });
          return;
        }
      }
      drags.set(api, { kind: "shape", start: p, end: p, e });
    },
    onPointerMove(p, e, api) {
      const d = drags.get(api);
      if (!d) return;
      if (d.kind === "move") {
        const { width, height } = selectionOf(api);
        const dx = Math.round(p.x - d.start.x);
        const dy = Math.round(p.y - d.start.y);
        writeSelection(api, d.base, { x: dx, y: dy, width, height }, "replace");
      } else {
        drags.set(api, { ...d, end: p, e });
        api.requestRender();
      }
    },
    onPointerUp(p, e, api) {
      const d = drags.get(api);
      drags.delete(api);
      if (!d || d.kind === "move") return;
      const op = opFromEvent(d.e, selectOptions(api).mode);
      const r = marqueeRect(d.start, p, { shift: d.e.shiftKey, alt: d.e.altKey });
      if (r.width === 0 || r.height === 0) clickDeselect(api, op);
      else finishShape(api, maskOf(r), r, op);
      api.requestRender();
    },
    onDeactivate(api) {
      drags.delete(api);
    },
    drawOverlay(ctx: CanvasRenderingContext2D, view: ViewTransform, api: EditorApi) {
      const d = drags.get(api);
      if (!d || d.kind !== "shape") return;
      const r = rectOf(d);
      const a = apply(view.docToScreen, { x: r.x, y: r.y });
      const b = apply(view.docToScreen, { x: r.x + r.width, y: r.y + r.height });
      ctx.save();
      ctx.beginPath();
      if (shape === "rect") ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      else
        ctx.ellipse(
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          (b.x - a.x) / 2,
          (b.y - a.y) / 2,
          0,
          0,
          Math.PI * 2,
        );
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#000";
      ctx.stroke();
      ctx.restore();
    },
  };
}

export const rectMarqueeTool: ToolSpec = withFloat(marquee("rect"));
export const ellipseMarqueeTool: ToolSpec = withFloat(marquee("ellipse"));
