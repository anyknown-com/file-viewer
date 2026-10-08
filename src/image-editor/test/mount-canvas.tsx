// Test helper (browser tests here and in 11–13): an EditorCanvas with a working EditorApi.
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ViewerError } from "../../contract/errors";
import { ViewerRoot } from "../../primitives/root";
import type { Doc, EditorApi, LayerId, Session } from "../api";
import { EditorCanvas, type View } from "../canvas";
import { createDocStore, type DocStore } from "../doc/store";
import { createEditorApi } from "../editor-api";
import { createBufferPool } from "../engine/buffers";
import { createGl } from "../engine/gl/context";
import { createPixels } from "../engine/pixels";
import { createRenderer } from "../engine/render";
import { createTextureStore } from "../engine/textures";
import { setups } from "../registry";
import { createUiSlot, UiOutlet, type UiSlot } from "../ui-slot";
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
 * Mounts EditorCanvas and UiOutlet in a 320 × 240 ViewerRoot (locale "en") and uploads every layer
 * that is neither a folder nor an adjustment as a solid texture the size of its transform:
 * `colors[id]` (RGBA 0–255, straight alpha) or a fixed color picked by the layer's index. Then calls
 * every `setups()` function with the api and `.fv-root`; `unmount` calls their cleanups first.
 */
export async function mountCanvas(
  doc: Doc,
  colors?: Record<LayerId, RGBA>,
  opts: { onError?(e: ViewerError): void } = {},
): Promise<{
  api: EditorApi;
  store: DocStore;
  canvas: HTMLCanvasElement;
  ui: UiSlot;
  unmount(): void;
}> {
  const canvas = document.createElement("canvas");
  const created = createGl(canvas);
  if (!created) throw new ViewerError("webgl_unavailable");
  const { gl, floatTargets } = created;
  const textures = createTextureStore(gl);
  const renderer = createRenderer(gl, textures, createBufferPool(gl, floatTargets));
  const store = createDocStore(doc);
  const pixels = createPixels(gl, textures, store.get);
  const worker = createWorkerRunner();
  const ui = createUiSlot();
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
    worker,
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

  const { width, height } = doc.manifest;
  function Harness() {
    const [view, setView] = useState<View>({ zoom: 1, center: { x: width / 2, y: height / 2 } });
    return (
      <ViewerRoot locale="en" onError={opts.onError}>
        <div style={{ width: 320, height: 240 }}>
          <EditorCanvas api={api} view={view} onViewChange={setView} />
        </div>
        <UiOutlet slot={ui} />
      </ViewerRoot>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Harness />));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const fvRoot = canvas.closest<HTMLElement>(".fv-root");
  if (!fvRoot) throw new Error("EditorCanvas is not inside .fv-root.");
  const cleanups = setups().map((fn) => fn(api, fvRoot));
  return {
    api,
    store,
    canvas,
    ui,
    unmount() {
      for (const cleanup of cleanups) cleanup?.();
      root.unmount();
      host.remove();
      worker.terminate();
    },
  };
}
