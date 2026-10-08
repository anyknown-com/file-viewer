// WebGL context loss: block input while the context is gone, then upload every layer again.
import type { EditorApi, MessageKey } from "../api";
import type { DocStore } from "../doc/store";
import { internalsOf } from "../editor-api";
import type { UiSlot } from "../ui-slot";
import { createPngCache, type PngCache } from "./png-cache";

const NOTICE: MessageKey = "image.notice.contextLost";

/** Calls `rebuild` on every restore; a loss during the rebuild keeps the editor blocked. */
export function watchContextLoss(
  canvas: HTMLCanvasElement,
  deps: {
    rebuild(): Promise<void>;
    setBlocked(b: boolean): void;
    notify(key: MessageKey | null): void;
  },
): () => void {
  let generation = 0;
  const onLost = (e: Event) => {
    e.preventDefault(); // without this the browser never restores the context
    generation++;
    deps.setBlocked(true);
    deps.notify(NOTICE);
  };
  const onRestored = () => {
    const at = ++generation;
    deps.rebuild().then(
      () => {
        if (at !== generation) return;
        deps.setBlocked(false);
        deps.notify(null);
      },
      () => {}, // lost again while rebuilding: the next restore tries again
    );
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  return () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
  };
}

/**
 * Uploads every layer image and mask again from its PNG bytes, after the PNG cache's running jobs
 * finish. Pixels that never reached a PNG are gone with the context: clear images, white masks.
 * Programs, buffers and LUTs rebuild themselves on next use (they check `gl.is*`).
 */
export async function rebuildGl(api: EditorApi, cache: PngCache): Promise<void> {
  const { textures } = internalsOf(api);
  await cache.idle();
  const doc = api.doc();
  const lost = textures.forget();
  await Promise.all(
    lost.map(async ({ id, target, smooth, size }) => {
      const sampling = smooth ? "High quality" : "Nearest";
      const stored = doc.pixels.get(id)?.[target];
      const bytes = stored?.kind === "png" ? stored.bytes : stored?.png;
      if (!bytes) {
        const channels = target === "image" ? 4 : 1;
        const data = new Uint8Array(size.width * size.height * channels);
        if (target === "mask") data.fill(255);
        textures.upload(id, target, { ...size, data }, sampling);
        return;
      }
      const kind = target === "image" ? "layer" : "mask";
      const png = await api.runInWorker({ kind: "decodePng", input: { bytes, kind } });
      textures.upload(id, target, png, sampling);
    }),
  );
  api.requestRender();
}

/** The PNG cache and context-loss handling for a mounted editor; returns the cleanup. */
export function guardContext(api: EditorApi, store: DocStore, ui: UiSlot): () => void {
  const cache = createPngCache(api, store);
  const stop = watchContextLoss(api.gl.canvas as HTMLCanvasElement, {
    rebuild: () => rebuildGl(api, cache),
    setBlocked: (b) => internalsOf(api).blocked.set(b),
    notify(key) {
      if (key) ui.note(key);
      else if (ui.notice()?.key === NOTICE) ui.dismiss();
    },
  });
  return () => {
    stop();
    cache.dispose();
  };
}
