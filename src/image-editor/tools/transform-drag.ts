// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerTransform.swift `LayerTransform`, `TransformDrag`), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { EditorApi, Layer, LayerId, Point, Rect } from "../api";
import { activeLayer, isFolder } from "../layer-ops";
import { layerDecors } from "../registry";

type Transform = Layer["transform"];
export type DragMode = { kind: "move" } | { kind: "resize"; handle: number } | { kind: "rotate" };

/** The eight handles in unit box coordinates, clockwise from the top left. */
export const HANDLES: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 0.5 },
  { x: 1, y: 1 },
  { x: 0.5, y: 1 },
  { x: 0, y: 1 },
  { x: 0, y: 0.5 },
];

const radians = (t: Transform) => ((t.rotation % 360) * Math.PI) / 180;
const centerOf = (t: Transform): Point => ({
  x: t.origin[0] + t.size[0] / 2,
  y: t.origin[1] + t.size[1] / 2,
});

/** The document point at `unit` of the box (0–1 each axis), after rotation about the center. */
export function pointOf(t: Transform, unit: Point): Point {
  const c = centerOf(t);
  const a = radians(t);
  const x = (unit.x - 0.5) * t.size[0];
  const y = (unit.y - 0.5) * t.size[1];
  return { x: c.x + x * Math.cos(a) - y * Math.sin(a), y: c.y + x * Math.sin(a) + y * Math.cos(a) };
}

export function contains(t: Transform, p: Point): boolean {
  const c = centerOf(t);
  const a = radians(t);
  const x = p.x - c.x;
  const y = p.y - c.y;
  return (
    Math.abs(x * Math.cos(a) + y * Math.sin(a)) <= t.size[0] / 2 &&
    Math.abs(-x * Math.sin(a) + y * Math.cos(a)) <= t.size[1] / 2
  );
}

/** The upright rectangle around the rotated box. */
export function boundsOf(t: Transform): Rect {
  const corners = [0, 2, 4, 6].map((i) => pointOf(t, HANDLES[i]));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function isValid(t: Transform): boolean {
  const values = [t.origin[0], t.origin[1], t.size[0], t.size[1], t.rotation];
  return (
    values.every(Number.isFinite) &&
    t.size.every((s) => s >= 1 && s <= 300_000) &&
    t.origin.every((o) => Math.abs(o) <= 1_000_000)
  );
}

/** `original` with handle `index` dragged from `start` to `p`: size, origin and flips. */
function resized(
  original: Transform,
  start: Point,
  index: number,
  p: Point,
  mods: { shift: boolean; alt: boolean },
): Pick<Transform, "size" | "origin" | "flipX" | "flipY"> {
  let { flipX, flipY } = original;
  const handle = HANDLES[index];
  const anchorUnit = mods.alt ? { x: 0.5, y: 0.5 } : { x: 1 - handle.x, y: 1 - handle.y };
  const anchor = pointOf(original, anchorUnit);
  // The initial handle plus the pointer's travel, so grabbing does not jump.
  const grabbed = pointOf(original, handle);
  const dx = grabbed.x + p.x - start.x - anchor.x;
  const dy = grabbed.y + p.y - start.y - anchor.y;
  const a = radians(original);
  const span = mods.alt ? 2 : 1;
  const localX = (dx * Math.cos(a) + dy * Math.sin(a)) * span;
  const localY = (-dx * Math.sin(a) + dy * Math.cos(a)) * span;
  const sx = handle.x * 2 - 1;
  const sy = handle.y * 2 - 1;
  const [w0, h0] = original.size;
  const rawW = sx === 0 ? w0 : localX * sx;
  const rawH = sy === 0 ? h0 : localY * sy;
  const mirroredX = rawW < 0;
  const mirroredY = rawH < 0;
  let width = Math.max(1, Math.abs(rawW));
  let height = Math.max(1, Math.abs(rawH));
  if (mods.shift) {
    let factor: number;
    if (sx === 0) factor = height / h0;
    else if (sy === 0) factor = width / w0;
    // Projected onto the original diagonal.
    else
      factor = Math.max(
        1 / Math.min(w0, h0),
        (localX * sx * w0 + localY * sy * h0) / (w0 * w0 + h0 * h0),
      );
    width = w0 * factor;
    height = h0 * factor;
  }
  if (mirroredX) flipX = !flipX;
  if (mirroredY) flipY = !flipY;
  // Turned over, the box lies on the other side of the anchor.
  const ox = (0.5 - anchorUnit.x) * width * (mirroredX ? -1 : 1);
  const oy = (0.5 - anchorUnit.y) * height * (mirroredY ? -1 : 1);
  const cx = anchor.x + ox * Math.cos(a) - oy * Math.sin(a);
  const cy = anchor.y + ox * Math.sin(a) + oy * Math.cos(a);
  return { size: [width, height], origin: [cx - width / 2, cy - height / 2], flipX, flipY };
}

/**
 * `original` dragged from `start` to `p`. Move: Shift keeps one axis. Rotate: Shift snaps to 15°.
 * Resize: Shift keeps the proportions, Alt scales about the center; past the opposite side the
 * layer flips on that axis.
 */
export function dragTo(
  original: Transform,
  start: Point,
  mode: DragMode,
  p: Point,
  mods: { shift: boolean; alt: boolean },
): Transform {
  const result: Transform = { ...original };
  if (mode.kind === "move") {
    let dx = p.x - start.x;
    let dy = p.y - start.y;
    if (mods.shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    result.origin = [original.origin[0] + dx, original.origin[1] + dy];
  } else if (mode.kind === "rotate") {
    const c = centerOf(original);
    const delta = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
    result.rotation = original.rotation + (delta * 180) / Math.PI;
    if (mods.shift) result.rotation = Math.round(result.rotation / 15) * 15;
  } else {
    Object.assign(result, resized(original, start, mode.handle, p, mods));
  }
  return isValid(result) ? result : original;
}

/** The layer the tool transforms: the active one, unless it is a folder or an adjustment layer. */
export function transformTarget(api: EditorApi): Layer | undefined {
  const layer = activeLayer(api);
  return layer && !isFolder(layer) && layer.adjustment === undefined ? layer : undefined;
}

/** Records one transform step for `id` (already previewed) and tells the layer decors. */
export function endTransform(api: EditorApi, id: LayerId, before: Transform): void {
  api.dispatch((doc) => doc, "image.transform.label");
  for (const decor of layerDecors()) decor.onTransformEnd?.(id, before, api);
}
