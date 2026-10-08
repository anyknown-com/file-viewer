import type { LayerShapeStyle } from "../../comp/index";
import type { EditorApi, Layer, LayerId, MessageKey } from "../api";
import { addRasterLayer, writeLayerRaster } from "../text/raster";
import { renderShape } from "./render";

function layerOf(api: EditorApi, id: LayerId): Layer {
  const layer = api.doc().manifest.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`No layer ${id}.`);
  return layer;
}

const px = (n: number) => Math.max(1, Math.round(n));

export function createShapeLayer(
  api: EditorApi,
  opts: {
    style: LayerShapeStyle;
    origin: [number, number];
    size: [number, number];
    name: string;
  },
): LayerId {
  const width = px(opts.size[0]);
  const height = px(opts.size[1]);
  const id = crypto.randomUUID().toUpperCase();
  const record: Layer = {
    id,
    name: opts.name,
    isVisible: true,
    imageFile: `${id}.png`,
    transform: {
      origin: opts.origin,
      size: [width, height],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "Smooth",
    },
    shape: opts.style,
  };
  return addRasterLayer(api, {
    record,
    raster: renderShape(opts.style, width, height),
    label: "image.shape.create",
  });
}

/** Redraws a shape layer with `style` at its current transform size (rounded); one undo step. */
export function updateShapeLayer(
  api: EditorApi,
  id: LayerId,
  style: LayerShapeStyle,
  label: MessageKey,
): void {
  const layer = layerOf(api, id);
  const width = px(layer.transform.size[0]);
  const height = px(layer.transform.size[1]);
  const next: Layer = {
    ...layer,
    shape: style,
    transform: { ...layer.transform, size: [width, height] },
  };
  writeLayerRaster(api, { id, next, raster: renderShape(style, width, height), label });
}

/** After a transform: a shape layer whose size changed is drawn again cleanly at the new size. */
export function redrawAfterTransform(
  id: LayerId,
  before: Layer["transform"],
  api: EditorApi,
): void {
  const layer = api.doc().manifest.layers.find((l) => l.id === id);
  if (!layer?.shape) return;
  const [w, h] = layer.transform.size;
  if (Math.abs(w - before.size[0]) < 0.5 && Math.abs(h - before.size[1]) < 0.5) return;
  updateShapeLayer(api, id, layer.shape, "image.shape.resize");
}
