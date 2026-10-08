import type { Command, Layer, LayerId } from "../api";
import { insertLayer, patchLayer } from "../doc/commands/layers";

export function newLayerId(): LayerId {
  return crypto.randomUUID().toUpperCase();
}

export function addPixelLayer(opts: {
  id: LayerId;
  name: string;
  above: LayerId | null;
  transform: Layer["transform"];
}): Command {
  return insertLayer(
    {
      id: opts.id,
      name: opts.name,
      isVisible: true,
      isGroup: false,
      opacity: 1,
      blendMode: "Normal",
      transform: opts.transform,
    },
    opts.above,
  );
}

export function rasterizeLayer(id: LayerId): Command {
  return patchLayer(id, { text: undefined, shape: undefined });
}

export function isPixelLayer(l: Layer): boolean {
  return l.isGroup !== true && l.adjustment === undefined;
}

export function needsRasterize(l: Layer): boolean {
  return l.text !== undefined || l.shape !== undefined;
}
