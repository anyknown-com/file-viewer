import type { LayerTextStyle } from "../../comp/index";
import type { EditorApi, Layer, LayerId, MessageKey } from "../api";
import { removeLayers } from "../doc/commands/layers";
import { ensureGeist, missingFonts } from "./fonts";
import { addRasterLayer, rasterSize, writeLayerRaster } from "./raster";
import { renderText } from "./render";
import { MAX_BOX, MIN_BOX } from "./style";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The first 30 graphemes of the content, runs of white space as one space. */
export function textLayerName(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return Array.from(graphemes.segment(flat), (g) => g.segment)
    .slice(0, 30)
    .join("");
}

function layerOf(api: EditorApi, id: LayerId): Layer {
  const layer = api.doc().manifest.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`No layer ${id}.`);
  return layer;
}

const clampBox = (n: number) => Math.min(MAX_BOX, Math.max(MIN_BOX, n));

/** Renders `style` into the layer at its new size, moving it to `origin` when given; one undo step. */
async function rerender(
  api: EditorApi,
  id: LayerId,
  style: LayerTextStyle,
  label: MessageKey,
  origin?: [number, number],
): Promise<void> {
  if (missingFonts(style).length > 0) throw new Error("missing fonts");
  await ensureGeist();
  const layer = layerOf(api, id);
  const raster = renderText(style);
  const next: Layer = {
    ...layer,
    text: style,
    name: textLayerName(style.content),
    transform: {
      ...layer.transform,
      origin: origin ?? layer.transform.origin,
      size: [raster.width, raster.height],
    },
  };
  writeLayerRaster(api, { id, next, raster, label });
}

export async function createTextLayer(
  api: EditorApi,
  opts: { style: LayerTextStyle; origin: [number, number] },
): Promise<LayerId> {
  await ensureGeist();
  const raster = renderText(opts.style);
  const id = crypto.randomUUID().toUpperCase();
  const record: Layer = {
    id,
    name: textLayerName(opts.style.content),
    isVisible: true,
    imageFile: `${id}.png`,
    transform: {
      origin: opts.origin,
      size: [raster.width, raster.height],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "Smooth",
    },
    text: opts.style,
  };
  return addRasterLayer(api, { record, raster, label: "image.text.create" });
}

/**
 * Re-renders a text layer with `style`. Throws when a font is missing (confirm and
 * `replaceMissingFonts` first). After the user scaled the layer, a paragraph box becomes the scaled
 * size; point text is laid out again at its natural size.
 */
export async function updateTextLayer(
  api: EditorApi,
  id: LayerId,
  style: LayerTextStyle,
  label: MessageKey,
): Promise<void> {
  if (missingFonts(style).length > 0) throw new Error("missing fonts");
  const [w, h] = layerOf(api, id).transform.size;
  const size = rasterSize(api, id);
  const scaled = Math.abs(w - size.width) >= 0.5 || Math.abs(h - size.height) >= 0.5;
  const next: LayerTextStyle =
    scaled && style.boxSize
      ? { ...style, boxSize: [clampBox(Math.round(w)), clampBox(Math.round(h))] }
      : style;
  await rerender(api, id, next, label);
}

/** Resizes a paragraph box (the text reflows; the font size stays) and moves it to `origin`. */
export async function resizeTextBox(
  api: EditorApi,
  id: LayerId,
  box: [number, number],
  origin: [number, number],
): Promise<void> {
  const text = layerOf(api, id).text;
  if (!text) throw new Error(`Layer ${id} is not a text layer.`);
  const style = {
    ...text,
    boxSize: [clampBox(box[0]), clampBox(box[1])] satisfies [number, number],
  };
  await rerender(api, id, style, "image.text.resizeBox", origin);
}

export function deleteTextLayer(api: EditorApi, id: LayerId): void {
  api.dispatch(removeLayers([id]), "image.text.edit");
}
