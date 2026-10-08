import type { Doc, Layer } from "../api";

function isPlain(l: Layer): boolean {
  return (
    l.isGroup !== true &&
    l.adjustment === undefined &&
    l.maskFile === undefined &&
    l.maskSourceID === undefined &&
    l.effects === undefined &&
    l.text === undefined &&
    l.shape === undefined &&
    (l.opacity ?? 1) === 1 &&
    (l.blendMode ?? "Normal") === "Normal" &&
    l.isVisible
  );
}

function coversCanvas(t: Layer["transform"], width: number, height: number): boolean {
  return (
    t.origin[0] === 0 &&
    t.origin[1] === 0 &&
    t.size[0] === width &&
    t.size[1] === height &&
    t.rotation === 0 &&
    !t.flipX &&
    !t.flipY
  );
}

/**
 * One visible plain layer covering the canvas as it is: nothing a flat image file cannot hold
 * (no folder, adjustment, mask, clipping, effects, text, shape, opacity, blend mode or transform).
 */
export function isFlat(doc: Doc): boolean {
  const { layers, width, height } = doc.manifest;
  return (
    layers.length === 1 && isPlain(layers[0]) && coversCanvas(layers[0].transform, width, height)
  );
}
