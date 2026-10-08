import type { LayerShapeStyle } from "../../comp/index";
import type { Point } from "../api";

type Frame = {
  origin: [number, number];
  size: [number, number];
  start?: [number, number];
  end?: [number, number];
};

const unit = (v: number) => Math.min(1, Math.max(0, v));
const sign = (n: number) => (n < 0 ? -1 : 1);

/**
 * The layer frame for a drag from `a` to `b`. Rectangle and ellipse: the box spanned by the two
 * points; Shift makes it square (the larger side wins), Alt grows it from `a` as its center. Line:
 * `a` to `b` (Shift snaps the angle to 45 degrees, Alt makes `a` the midpoint), the frame padded by
 * `lineWidth / 2` on every side; `start` / `end` are the ends as fractions of the frame.
 */
export function dragFrame(
  kind: LayerShapeStyle["kind"],
  a: Point,
  b: Point,
  mods: { shift: boolean; alt: boolean },
  lineWidth: number,
): Frame {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (kind === "Line") return lineFrame(a, dx, dy, mods, lineWidth);
  if (mods.shift) {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    dx = sign(dx) * s;
    dy = sign(dy) * s;
  }
  const w = Math.max(1, mods.alt ? 2 * Math.abs(dx) : Math.abs(dx));
  const h = Math.max(1, mods.alt ? 2 * Math.abs(dy) : Math.abs(dy));
  const x = mods.alt ? a.x - w / 2 : Math.min(a.x, a.x + dx);
  const y = mods.alt ? a.y - h / 2 : Math.min(a.y, a.y + dy);
  return { origin: [x, y], size: [w, h] };
}

function lineFrame(
  a: Point,
  dx: number,
  dy: number,
  mods: { shift: boolean; alt: boolean },
  lineWidth: number,
): Frame {
  if (mods.shift) {
    const len = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    dx = len * Math.cos(angle);
    dy = len * Math.sin(angle);
  }
  const p = mods.alt ? { x: a.x - dx, y: a.y - dy } : a;
  const q = { x: a.x + dx, y: a.y + dy };
  const pad = lineWidth / 2;
  const x = Math.min(p.x, q.x) - pad;
  const y = Math.min(p.y, q.y) - pad;
  const w = Math.max(1, Math.abs(q.x - p.x) + lineWidth);
  const h = Math.max(1, Math.abs(q.y - p.y) + lineWidth);
  return {
    origin: [x, y],
    size: [w, h],
    start: [unit((p.x - x) / w), unit((p.y - y) / h)],
    end: [unit((q.x - x) / w), unit((q.y - y) / h)],
  };
}
