import { fromImage } from "../../comp/index";
import type { Doc, Layer, LayerId, LayerPixels } from "../api";

/**
 * A test document: 09's `fromImage` manifest (every required field) with `layers` in place of its
 * one layer. Missing fields get an id, "Layer <index>", visible, not a folder, opacity 1, Normal and
 * a transform covering the canvas; no `imageFile`. The last layer is active; every layer that is
 * neither a folder nor an adjustment layer has GPU image pixels.
 */
export function makeDoc(spec: { width: number; height: number; layers: Partial<Layer>[] }): Doc {
  const { width, height } = spec;
  const base = fromImage({ width, height, rgba: new Uint8Array(width * height * 4) }, "Background");
  const layers: Layer[] = spec.layers.map((layer, index) => ({
    id: crypto.randomUUID().toUpperCase(),
    name: `Layer ${index}`,
    isVisible: true,
    isGroup: false,
    opacity: 1,
    blendMode: "Normal",
    transform: {
      origin: [0, 0],
      size: [width, height],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "High quality",
    },
    ...layer,
  }));
  const pixels = new Map<LayerId, { image?: LayerPixels; mask?: LayerPixels }>();
  for (const layer of layers) {
    if (layer.isGroup !== true && layer.adjustment === undefined)
      pixels.set(layer.id, { image: { kind: "gpu" } });
  }
  return { manifest: { ...base.manifest, layers, activeLayerID: layers.at(-1)?.id }, pixels };
}
