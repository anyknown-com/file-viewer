// The crop tool: drag out a box (in a ratio, Alt from its center), Enter crops the canvas to it, Esc
// drops it. Pixels stay; layers shift by the box's corner.
import type { EditorApi, Point, Rect, ToolSpec } from "../api";
import { CropIcon } from "../glyphs";
import {
  cancelCrop,
  confirmCrop,
  CropPanel,
  type CropRatio,
  cropState,
  update,
} from "./crop-panel";

/** Width over height; null for free. */
function ratioOf(api: EditorApi, ratio: CropRatio): number | null {
  if (ratio === "free") return null;
  if (ratio === "original") return api.doc().manifest.width / api.doc().manifest.height;
  const [w, h] = ratio.split(":").map(Number);
  return w / h;
}

/** The box from `start` to `p`; with `alt`, `start` is its center. */
export function boxFrom(start: Point, p: Point, ratio: number | null, alt: boolean): Rect {
  let w = Math.abs(p.x - start.x);
  let h = Math.abs(p.y - start.y);
  if (ratio !== null) {
    if (w / ratio >= h) h = w / ratio;
    else w = h * ratio;
  }
  if (alt) return { x: start.x - w, y: start.y - h, width: 2 * w, height: 2 * h };
  return {
    x: p.x < start.x ? start.x - w : start.x,
    y: p.y < start.y ? start.y - h : start.y,
    width: w,
    height: h,
  };
}

export const cropTool: ToolSpec = {
  id: "crop",
  label: "image.tools.crop",
  icon: CropIcon,
  cursor: "crosshair",
  key: "C",
  panel: CropPanel,
  onPointerDown(p, _e, api) {
    update(api, { start: p, box: null });
  },
  onPointerMove(p, e, api) {
    const { start, ratio } = cropState(api);
    if (start) update(api, { box: boxFrom(start, p, ratioOf(api, ratio), e.altKey) });
  },
  onPointerUp(_p, _e, api) {
    update(api, { start: null });
  },
  onKeyDown(e, api) {
    if (e.key === "Enter") return confirmCrop(api);
    if (e.key !== "Escape" || !cropState(api).box) return false;
    cancelCrop(api);
    return true;
  },
  drawOverlay(ctx, view, api) {
    const box = cropState(api).box;
    if (!box) return;
    const m = view.docToScreen;
    const corners = [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x + box.width, box.y + box.height],
      [box.x, box.y + box.height],
    ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const);
    // Outside the box darkened: the whole canvas (device px) and the box, filled even-odd.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fill("evenodd");
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  },
  onDeactivate(api) {
    cancelCrop(api);
  },
};
