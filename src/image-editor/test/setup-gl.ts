// Test helper: a working EditorApi on `canvas`, every plain layer uploaded as a solid color.
import { ViewerError } from "../../contract/errors";
import type { Doc, EditorApi, LayerId, Session } from "../api";
import { createDocStore, type DocStore } from "../doc/store";
import { createEditorApi } from "../editor-api";
import { createBufferPool } from "../engine/buffers";
import { createGl } from "../engine/gl/context";
import { createPixels } from "../engine/pixels";
import { createRenderer } from "../engine/render";
import { createTextureStore } from "../engine/textures";
import type { UiSlot } from "../ui-slot";
import { createWorkerRunner } from "../worker/run-in-worker";

type RGBA = [number, number, number, number];

const PALETTE: RGBA[] = [
  [230, 60, 50, 255],
  [40, 160, 70, 255],
  [50, 90, 220, 255],
  [240, 200, 40, 255],
  [150, 60, 200, 255],
  [30, 190, 200, 255],
];

/**
 * Uploads every layer that is neither a folder nor an adjustment as a solid texture the size of its
 * transform: `colors[id]` (RGBA 0–255, straight alpha) or a fixed color picked by the layer's index.
 * The worker starts on first use; `internalsOf(api).worker.terminate()` stops it.
 */
export function setupGl(
  canvas: HTMLCanvasElement,
  doc: Doc,
  ui: UiSlot,
  colors?: Record<LayerId, RGBA>,
): { api: EditorApi; store: DocStore } {
  const created = createGl(canvas);
  if (!created) throw new ViewerError("webgl_unavailable");
  const { gl, floatTargets } = created;
  const textures = createTextureStore(gl);
  const renderer = createRenderer(gl, textures, createBufferPool(gl, floatTargets));
  const store = createDocStore(doc);
  const pixels = createPixels(gl, textures, store.get);
  let session: Session = {
    active: doc.manifest.activeLayerID ?? null,
    target: "image",
    tool: "",
    collapsed: new Set(),
    renderHidden: new Set(),
  };
  const api = createEditorApi({
    gl,
    store,
    textures,
    renderer,
    pixels,
    worker: createWorkerRunner(),
    session: { get: () => session, set: (p) => (session = { ...session, ...p }) },
    ui,
    requestRender: () => {},
  });

  doc.manifest.layers.forEach((layer, index) => {
    if (layer.isGroup === true || layer.adjustment) return;
    const width = Math.round(layer.transform.size[0]);
    const height = Math.round(layer.transform.size[1]);
    const color = colors?.[layer.id] ?? PALETTE[index % PALETTE.length];
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set(color, i);
    textures.upload(layer.id, "image", { width, height, data }, layer.transform.sampling);
  });
  return { api, store };
}
