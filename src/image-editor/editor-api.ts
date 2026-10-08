// The EditorApi that tools and the 11–13 extensions drive (see the plan's "擴充介面").
import { ViewerError } from "../contract/errors";
import type { Doc, EditorApi, LayerId, LayerPixels, Session } from "./api";
import type { DocStore } from "./doc/store";
import { layerMatrixOf } from "./doc/layer-matrix";
import type { Pixels } from "./engine/pixels";
import type { Renderer } from "./engine/render";
import type { TextureStore } from "./engine/textures";
import { pixelBudget } from "./limits";
import { selectionProvider, tools } from "./registry";
import type { UiSlot } from "./ui-slot";
import type { WorkerRunner } from "./worker/run-in-worker";

export type EditorDeps = {
  gl: WebGL2RenderingContext;
  store: DocStore;
  textures: TextureStore;
  renderer: Renderer;
  pixels: Pixels;
  worker: WorkerRunner;
  session: { get(): Session; set(p: Partial<Session>): void };
  ui: UiSlot;
  requestRender(): void;
};

/**
 * What the editor's own UI needs beyond EditorApi: the renderer and a hook called on
 * requestRender (EditorCanvas), the store (undo / redo), session changes and pixel versions
 * (the layer panel), the worker (unmount), and the textures and blocked flag (WebGL context loss).
 */
export type EditorInternals = {
  renderer: Renderer;
  onFrame(fn: (() => void) | null): void;
  store: DocStore;
  worker: WorkerRunner;
  /** For useSyncExternalStore with api.session: called after every setSession. */
  subscribeSession(fn: () => void): () => void;
  /** Bumped on every write to the layer's image or mask texture. */
  pixelVersion(id: LayerId): number;
  textures: TextureStore;
  /** True while the WebGL context is lost: the shell takes no input. */
  blocked: { get(): boolean; set(b: boolean): void; subscribe(fn: () => void): () => void };
};

const internals = new WeakMap<EditorApi, EditorInternals>();

export function internalsOf(api: EditorApi): EditorInternals {
  const found = internals.get(api);
  if (!found) throw new Error("This EditorApi was not made by createEditorApi.");
  return found;
}

/** `doc` with the touched pixels marked as living on the GPU (no PNG cache any more). */
function markGpu(doc: Doc, touched: Iterable<{ layer: LayerId; target: "image" | "mask" }>): Doc {
  const pixels = new Map(doc.pixels);
  for (const { layer, target } of touched) {
    const entry: { image?: LayerPixels; mask?: LayerPixels } = { ...pixels.get(layer) };
    entry[target] = { kind: "gpu" };
    pixels.set(layer, entry);
  }
  return { ...doc, pixels };
}

export function createEditorApi(deps: EditorDeps): EditorApi {
  const { gl, store, textures, renderer, pixels, worker, session, ui } = deps;
  let frame: (() => void) | null = null;
  const sessionListeners = new Set<() => void>();
  const blockedListeners = new Set<() => void>();
  let blocked = false;
  const requestRender = () => {
    deps.requestRender();
    frame?.();
  };

  const api: EditorApi = {
    gl,
    doc: () => store.get(),
    session: () => session.get(),
    setSession(patch) {
      const current = session.get().tool;
      if (patch.tool !== undefined && patch.tool !== current) {
        tools()
          .find((t) => t.id === current)
          ?.onDeactivate?.(api);
      }
      session.set(patch);
      for (const fn of sessionListeners) fn();
      requestRender();
    },
    dispatch(command, label) {
      store.dispatch(command, label);
      if (label !== undefined) ui.dismiss();
      requestRender();
    },
    commit(label, doc, tiles, resizes = []) {
      for (const tile of tiles) tile.after = pixels.readRegion(tile.layer, tile.target, tile);
      for (const r of resizes) {
        const size = pixels.pixelSize(r.layer, r.target) ?? { width: 0, height: 0 };
        const data = pixels.readRegion(r.layer, r.target, { x: 0, y: 0, ...size });
        r.after = { ...size, data };
      }
      store.commit(label, markGpu(doc, [...tiles, ...resizes]), tiles, resizes);
      ui.dismiss();
      requestRender();
    },
    snapshotTiles: pixels.snapshotTiles,
    layerTexture: pixels.layerTexture,
    maskTexture: pixels.maskTexture,
    pixelSize: pixels.pixelSize,
    resizePixels: pixels.resizePixels,
    writeRegion: pixels.writeRegion,
    readRegion: pixels.readRegion,
    readComposite(rect) {
      const buffer = renderer.pool.borrow(rect.width, rect.height);
      const out = {
        framebuffer: buffer.framebuffer,
        width: rect.width,
        height: rect.height,
        docRect: rect,
      };
      renderer.render(store.get(), session.get(), out, { forExport: true });
      const data = renderer.readStraight(buffer.texture, rect.width, rect.height);
      buffer.release();
      return data;
    },
    layerMatrix(id) {
      const t = store.get().manifest.layers.find((l) => l.id === id)?.transform;
      if (!t) throw new Error(`No layer ${id}.`);
      const size = pixels.pixelSize(id, "image") ?? {
        width: Math.round(t.size[0]),
        height: Math.round(t.size[1]),
      };
      return layerMatrixOf(t, size);
    },
    checkBudget(add) {
      const totals = textures.totals();
      const budget = pixelBudget();
      const over =
        totals.layerPx + (add.layerPx ?? 0) > budget || totals.maskPx + (add.maskPx ?? 0) > budget;
      return over ? new ViewerError("too_large") : null;
    },
    runInWorker: (job, transfer, signal) => worker.run(job, transfer, signal),
    requestRender,
    selection: () => selectionProvider()?.get(api) ?? null,
    openDialog: (render) => ui.open(render),
    showError: (e, key, vars) => ui.error(e, key, vars),
    t: (key, vars) => ui.t(key, vars),
  };
  internals.set(api, {
    renderer,
    onFrame(fn) {
      frame = fn;
    },
    store,
    worker,
    subscribeSession(fn) {
      sessionListeners.add(fn);
      return () => sessionListeners.delete(fn);
    },
    pixelVersion: (id) => textures.version(id),
    textures,
    blocked: {
      get: () => blocked,
      set(b) {
        if (b === blocked) return;
        blocked = b;
        for (const fn of blockedListeners) fn();
      },
      subscribe(fn) {
        blockedListeners.add(fn);
        return () => blockedListeners.delete(fn);
      },
    },
  });
  return api;
}

type StepResult = NonNullable<ReturnType<DocStore["undo"]> | ReturnType<DocStore["redo"]>>;

/**
 * Puts an undo or redo step's pixels back. Undo: tiles' before first, then resizes' before.
 * Redo: resizes' after first, then tiles' after.
 */
export function applyUndo(api: EditorApi, result: StepResult): void {
  const writeTiles = () => {
    for (const { tile, use } of result.tiles) {
      const data = tile[use];
      if (data) api.writeRegion(tile.layer, tile.target, tile, data);
    }
  };
  const swapSizes = () => {
    for (const { resize, use } of result.resizes) {
      const s = resize[use];
      if (s) api.resizePixels(resize.layer, resize.target, s, { pixels: s.data });
    }
  };
  const undo =
    result.tiles.every((t) => t.use === "before") &&
    result.resizes.every((r) => r.use === "before");
  if (undo) {
    writeTiles();
    swapSizes();
  } else {
    swapSizes();
    writeTiles();
  }
  api.requestRender();
}
