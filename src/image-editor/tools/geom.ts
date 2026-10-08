import type { EditorApi, LayerId, Mat2D, PixelTarget, Point, Rect, Size } from "../api";
import { layerMatrixOf } from "../doc/layer-matrix";

export function apply(m: Mat2D, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function invert(m: Mat2D): Mat2D {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** m ∘ n: n first, then m. */
export function multiply(m: Mat2D, n: Mat2D): Mat2D {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** The texture size, or the rounded transform size while the layer has no texture. */
export function layerPixelSize(api: EditorApi, id: LayerId, target: PixelTarget = "image"): Size {
  const px = api.pixelSize(id, target);
  if (px) return px;
  const layer = api.doc().manifest.layers.find((l) => l.id === id);
  const t = target === "mask" ? (layer?.maskPlacement ?? layer?.transform) : layer?.transform;
  return {
    width: Math.max(1, Math.round(t?.size[0] ?? 1)),
    height: Math.max(1, Math.round(t?.size[1] ?? 1)),
  };
}

/** Document → pixel space of the layer's image or mask. */
export function targetMatrix(api: EditorApi, id: LayerId, target: PixelTarget): Mat2D {
  if (target === "image") return api.layerMatrix(id);
  const layer = api.doc().manifest.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`image-editor: no layer ${id}`);
  return layerMatrixOf(layer.maskPlacement ?? layer.transform, layerPixelSize(api, id, "mask"));
}

/** The outer pixel rectangle of a document rectangle, corners rounded outward. */
export function docRectToLayer(
  api: EditorApi,
  id: LayerId,
  r: Rect,
  target: PixelTarget = "image",
): Rect {
  const m = targetMatrix(api, id, target);
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x, y: r.y + r.height },
    { x: r.x + r.width, y: r.y + r.height },
  ].map((p) => apply(m, p));
  const x0 = Math.floor(Math.min(...corners.map((p) => p.x)));
  const y0 = Math.floor(Math.min(...corners.map((p) => p.y)));
  const x1 = Math.ceil(Math.max(...corners.map((p) => p.x)));
  const y1 = Math.ceil(Math.max(...corners.map((p) => p.y)));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
