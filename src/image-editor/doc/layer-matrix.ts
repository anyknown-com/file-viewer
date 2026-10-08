// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/BrushStroke.swift `pixelToDocument` and Compositor/Document/LayerTransform.swift `placing`, `following`), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Layer, Mat2D, Point, Size } from "../api";

type Transform = Layer["transform"];

function multiply(m: Mat2D, n: Mat2D): Mat2D {
  // m ∘ n: n first, then m.
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function invert(m: Mat2D): Mat2D {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

function apply(m: Mat2D, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function radians(t: Transform): number {
  return ((t.rotation % 360) * Math.PI) / 180;
}

/** Layer pixel → document: about the rectangle's center, rotated clockwise, flipped inside it. */
function pixelToDocument(t: Transform, px: Size): Mat2D {
  const r = radians(t);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const kx = (t.size[0] / px.width) * (t.flipX ? -1 : 1);
  const ky = (t.size[1] / px.height) * (t.flipY ? -1 : 1);
  const a = cos * kx;
  const b = sin * kx;
  const c = -sin * ky;
  const d = cos * ky;
  const cx = t.origin[0] + t.size[0] / 2;
  const cy = t.origin[1] + t.size[1] / 2;
  const hw = px.width / 2;
  const hh = px.height / 2;
  return [a, b, c, d, cx - (a * hw + c * hh), cy - (b * hw + d * hh)];
}

/** Document → layer pixel; pixel (0, 0) is the top left before flipping. */
export function layerMatrixOf(t: Transform, px: Size): Mat2D {
  return invert(pixelToDocument(t, px));
}

/**
 * The transform for pixels resized from `from` to `to`, the old pixels placed at `offset`: each old
 * pixel stays where it was on the document and the pixel density stays the same.
 */
export function resizedTransform(t: Transform, from: Size, to: Size, offset: Point): Transform {
  const size: [number, number] = [
    (t.size[0] * to.width) / from.width,
    (t.size[1] * to.height) / from.height,
  ];
  const m = pixelToDocument(t, from);
  // The new center is where the old matrix puts new pixel `to / 2`, i.e. old pixel `to / 2 - offset`.
  const center = apply(m, to.width / 2 - offset.x, to.height / 2 - offset.y);
  return { ...t, size, origin: [center.x - size[0] / 2, center.y - size[1] / 2] };
}

// LayerTransform.swift `placing`: a transform placing the unit square as `map` does (shear dropped).
function placing(t: Transform, map: Mat2D): Transform {
  const sign = t.flipX ? -1 : 1;
  const angle = Math.atan2(map[1] * sign, map[0] * sign);
  const along = -map[2] * Math.sin(angle) + map[3] * Math.cos(angle);
  const middle = apply(map, 0.5, 0.5);
  const size: [number, number] = [Math.hypot(map[0], map[1]), Math.abs(along)];
  const degrees = (angle * 180) / Math.PI;
  return {
    ...t,
    size,
    rotation: degrees + Math.round((t.rotation - degrees) / 360) * 360,
    flipY: along < 0,
    origin: [middle.x - size[0] / 2, middle.y - size[1] / 2],
  };
}

function sameTransform(a: Transform, b: Transform): boolean {
  return (
    a.origin[0] === b.origin[0] &&
    a.origin[1] === b.origin[1] &&
    a.size[0] === b.size[0] &&
    a.size[1] === b.size[1] &&
    a.rotation === b.rotation &&
    a.flipX === b.flipX &&
    a.flipY === b.flipY &&
    a.sampling === b.sampling
  );
}

/** LayerTransform.swift `following`: `placement` carried along as a layer moves from `from` to `to`. */
export function followingTransform(
  placement: Transform,
  from: Transform,
  to: Transform,
): Transform {
  if (sameTransform(from, to)) return placement;
  if (
    from.size[0] === to.size[0] &&
    from.size[1] === to.size[1] &&
    from.rotation === to.rotation &&
    from.flipX === to.flipX &&
    from.flipY === to.flipY
  ) {
    return {
      ...placement,
      origin: [
        placement.origin[0] + to.origin[0] - from.origin[0],
        placement.origin[1] + to.origin[1] - from.origin[1],
      ],
    };
  }
  const unit: Size = { width: 1, height: 1 };
  const map = multiply(
    pixelToDocument(to, unit),
    multiply(invert(pixelToDocument(from, unit)), pixelToDocument(placement, unit)),
  );
  return placing(placement, map);
}
