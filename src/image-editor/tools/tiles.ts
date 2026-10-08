import type { EditorApi, LayerId, PixelTarget, PixelTile, Rect } from "../api";
import { layerPixelSize } from "./geom";

const TILE = 256;

export type TileTracker = {
  touch(rect: Rect): void;
  tiles(): PixelTile[];
  has(): boolean;
};

/** Snapshots each 256 × 256 cell of one layer target once, the first time a rect touches it. */
export function createTileTracker(api: EditorApi, id: LayerId, target: PixelTarget): TileTracker {
  const seen = new Set<string>();
  const out: PixelTile[] = [];
  return {
    touch(rect) {
      const size = layerPixelSize(api, id, target);
      const x0 = Math.max(0, Math.floor(rect.x));
      const y0 = Math.max(0, Math.floor(rect.y));
      const x1 = Math.min(size.width, Math.ceil(rect.x + rect.width));
      const y1 = Math.min(size.height, Math.ceil(rect.y + rect.height));
      if (x1 <= x0 || y1 <= y0) return;
      for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y1 - 1) / TILE); ty++) {
        for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x1 - 1) / TILE); tx++) {
          const key = `${tx},${ty}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const cell = {
            x: tx * TILE,
            y: ty * TILE,
            width: Math.min(TILE, size.width - tx * TILE),
            height: Math.min(TILE, size.height - ty * TILE),
          };
          out.push(...api.snapshotTiles(id, target, cell));
        }
      }
    },
    tiles: () => out,
    has: () => out.length > 0,
  };
}
