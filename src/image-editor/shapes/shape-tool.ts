// The shape tool (U): drag out a rectangle, ellipse or line.
import type { LayerShapeStyle } from "../../comp/index";
import type { EditorApi, Point, ToolSpec, ViewTransform } from "../api";
import { ShapeIcon } from "../text/glyphs";
import { apply } from "../tools/geom";
import { dragFrame } from "./geometry";
import { createShapeLayer } from "./layer";
import { ShapePanel } from "./panel";
import { DEFAULT_LINE_WIDTH } from "./render";
import { shapeToolState } from "./tool-state";

const MIN_DRAG = 2; // document px

export const SHAPE_LABEL = {
  Rectangle: "image.shape.rectangle",
  Ellipse: "image.shape.ellipse",
  Line: "image.shape.line",
} as const;

type Drag = { start: Point; at: Point; shift: boolean; alt: boolean };
let drag: Drag | null = null;

const frameOf = (d: Drag, style: LayerShapeStyle) =>
  dragFrame(style.kind, d.start, d.at, d, style.lineWidth ?? DEFAULT_LINE_WIDTH);

function big(d: Drag, style: LayerShapeStyle): boolean {
  if (style.kind === "Line") return Math.hypot(d.at.x - d.start.x, d.at.y - d.start.y) >= MIN_DRAG;
  const { size } = frameOf(d, style);
  return size[0] >= MIN_DRAG && size[1] >= MIN_DRAG;
}

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

export const shapeTool: ToolSpec = {
  id: "shape",
  key: "U",
  label: "image.shape.tool",
  icon: ShapeIcon,
  cursor: "crosshair",
  onPointerDown(p, e) {
    drag = { start: p, at: p, shift: e.shiftKey, alt: e.altKey };
  },
  onPointerMove(p, e, api) {
    if (!drag) return;
    drag = { ...drag, at: p, shift: e.shiftKey, alt: e.altKey };
    api.requestRender();
  },
  onPointerUp(p, e, api: EditorApi) {
    if (!drag) return;
    const d: Drag = { ...drag, at: p, shift: e.shiftKey, alt: e.altKey };
    drag = null;
    api.requestRender();
    const style = shapeToolState.get();
    if (!big(d, style)) return;
    const { origin, size, start, end } = frameOf(d, style);
    createShapeLayer(api, {
      style: style.kind === "Line" ? { ...style, start, end } : style,
      origin,
      size,
      name: api.t(SHAPE_LABEL[style.kind]),
    });
  },
  drawOverlay(ctx: CanvasRenderingContext2D, view: ViewTransform) {
    if (!drag) return;
    const style = shapeToolState.get();
    const f = frameOf(drag, style);
    const to = (x: number, y: number) => apply(view.docToScreen, { x, y });
    const a = to(f.origin[0], f.origin[1]);
    const b = to(f.origin[0] + f.size[0], f.origin[1] + f.size[1]);
    ctx.beginPath();
    if (style.kind === "Line" && f.start && f.end) {
      const s = to(f.origin[0] + f.start[0] * f.size[0], f.origin[1] + f.start[1] * f.size[1]);
      const t = to(f.origin[0] + f.end[0] * f.size[0], f.origin[1] + f.end[1] * f.size[1]);
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
    } else if (style.kind === "Ellipse") {
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
    } else {
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    outline(ctx);
  },
  panel: ShapePanel,
};
