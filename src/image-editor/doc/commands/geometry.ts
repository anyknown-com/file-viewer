// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerFlip.swift, Compositor/Document/CanvasSize.swift, Compositor/Document/Guides.swift, Compositor/Document/LayerMask.swift `placement(movingLayer:to:)`), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { CanvasGuide } from "../../../comp/index";
import type { Command, Doc, Layer, LayerId, Rect } from "../../api";
import { followingTransform } from "../layer-matrix";

type Transform = Layer["transform"];

/**
 * The layer's transform; a linked mask with its own placement moves and scales along. An unlinked
 * mask stays where it is on the document.
 */
export function setTransform(id: LayerId, t: Transform): Command {
  return (doc) => {
    const index = doc.manifest.layers.findIndex((l) => l.id === id);
    if (index < 0) return doc;
    const layer = doc.manifest.layers[index];
    const next: Layer = { ...layer, transform: t };
    if (layer.maskFile !== undefined && layer.maskLinked !== false && layer.maskPlacement) {
      next.maskPlacement = followingTransform(layer.maskPlacement, layer.transform, t);
    } else if (layer.maskFile !== undefined && layer.maskLinked === false && !layer.maskPlacement) {
      next.maskPlacement = layer.transform;
    }
    const layers = doc.manifest.layers.with(index, next);
    return { ...doc, manifest: { ...doc.manifest, layers } };
  };
}

/** Every layer transform and mask placement through `map`; guides through `guide`. */
function mapPlacements(
  doc: Doc,
  size: { width: number; height: number },
  map: (t: Transform) => Transform,
  guide: (g: CanvasGuide) => CanvasGuide,
): Doc {
  const layers = doc.manifest.layers.map((l) => ({
    ...l,
    transform: map(l.transform),
    ...(l.maskPlacement ? { maskPlacement: map(l.maskPlacement) } : {}),
  }));
  const guides = doc.manifest.guides?.map(guide);
  const manifest = { ...doc.manifest, ...size, layers };
  if (guides) manifest.guides = guides;
  return { ...doc, manifest };
}

/** The canvas becomes `rect`; layers and guides shift by its corner. Pixels stay as they are. */
export function crop(rect: Rect): Command {
  return (doc) =>
    mapPlacements(
      doc,
      { width: rect.width, height: rect.height },
      (t) => ({ ...t, origin: [t.origin[0] - rect.x, t.origin[1] - rect.y] }),
      (g) => ({ ...g, position: g.position - (g.axis === "vertical" ? rect.x : rect.y) }),
    );
}

/**
 * CanvasSize.swift `CanvasSizeOptions.offset`: `anchor` is row-major, top left (0) to bottom right
 * (8). Floor puts an odd extra pixel on the right / bottom.
 */
export function canvasSize(
  w: number,
  h: number,
  anchor: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
): Command {
  return (doc) => {
    const x = Math.floor(((w - doc.manifest.width) * (anchor % 3)) / 2);
    const y = Math.floor(((h - doc.manifest.height) * Math.floor(anchor / 3)) / 2);
    return crop({ x: -x, y: -y, width: w, height: h })(doc);
  };
}

/** LayerFlip.swift `mirrored`: the picture flips, its angle turns the other way. */
function mirrored(t: Transform, horizontally: boolean, axis: number): Transform {
  if (horizontally) {
    return {
      ...t,
      flipX: !t.flipX,
      rotation: -t.rotation,
      origin: [2 * axis - t.origin[0] - t.size[0], t.origin[1]],
    };
  }
  return {
    ...t,
    flipY: !t.flipY,
    rotation: -t.rotation,
    origin: [t.origin[0], 2 * axis - t.origin[1] - t.size[1]],
  };
}

/** LayerFlip.swift `flipCanvas`: every layer, folder, placed mask and guide mirrored across the middle. */
export function flipCanvas(axis: "x" | "y"): Command {
  return (doc) => {
    const horizontally = axis === "x";
    const middle = horizontally ? doc.manifest.width / 2 : doc.manifest.height / 2;
    const across = horizontally ? "vertical" : "horizontal";
    return mapPlacements(
      doc,
      { width: doc.manifest.width, height: doc.manifest.height },
      (t) => mirrored(t, horizontally, middle),
      (g) => (g.axis === across ? { ...g, position: 2 * middle - g.position } : g),
    );
  };
}

/** A quarter turn (90 = clockwise): width and height swap, each layer turns about the canvas. */
export function rotateCanvas(dir: 90 | -90): Command {
  return (doc) => {
    const { width, height } = doc.manifest;
    const turn = (x: number, y: number): [number, number] =>
      dir === 90 ? [height - y, x] : [y, width - x];
    return mapPlacements(
      doc,
      { width: height, height: width },
      (t) => {
        const [cx, cy] = turn(t.origin[0] + t.size[0] / 2, t.origin[1] + t.size[1] / 2);
        return {
          ...t,
          rotation: t.rotation + dir,
          origin: [cx - t.size[0] / 2, cy - t.size[1] / 2],
        };
      },
      (g) => {
        const vertical = g.axis === "vertical";
        const [x, y] = turn(vertical ? g.position : 0, vertical ? 0 : g.position);
        return { ...g, axis: vertical ? "horizontal" : "vertical", position: vertical ? y : x };
      },
    );
  };
}
