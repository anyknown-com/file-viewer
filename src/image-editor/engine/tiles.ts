import type { Doc, Rect } from "../api";
import { adjustment, effects } from "../registry";

/**
 * Document rectangles of `size` × `size` (smaller at the right and bottom) covering the canvas.
 * One rectangle for the whole canvas when a tile plus `reach` on each side exceeds `maxTexture`.
 */
export function exportTiles(doc: Doc, size: number, reach: number, maxTexture: number): Rect[] {
  const { width, height } = doc.manifest;
  if (size + 2 * reach > maxTexture) return [{ x: 0, y: 0, width, height }];
  const tiles: Rect[] = [];
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      tiles.push({ x, y, width: Math.min(size, width - x), height: Math.min(size, height - y) });
    }
  }
  return tiles;
}

/** The most any adjustment or effect reaches outward, in output px at `scale`. */
export function totalReach(doc: Doc, scale: number): number {
  let reach = 0;
  const fx = effects();
  for (const layer of doc.manifest.layers) {
    if (layer.adjustment) {
      reach = Math.max(
        reach,
        adjustment(layer.adjustment.kind)?.reach(layer.adjustment, scale) ?? 0,
      );
    }
    if (layer.effects && fx) reach = Math.max(reach, fx.reach(layer.effects, scale));
  }
  return Math.ceil(reach);
}
