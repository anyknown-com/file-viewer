// Encodes changed layers to PNG in the background, so saving and WebGL context restore have bytes
// without reading the GPU again.
import type { EditorApi, LayerId, LayerPixels, PixelTarget } from "../api";
import type { DocStore } from "../doc/store";

type Job = { source: LayerPixels; ctl: AbortController; done: Promise<void> };

const TARGETS: readonly PixelTarget[] = ["image", "mask"];

export type PngCache = {
  /** Resolves once no job is running (jobs started meanwhile included). */
  idle(): Promise<void>;
  dispose(): void;
};

/**
 * After every recorded change (undo and redo too), each `{ kind: "gpu" }` image or mask with no
 * `png` is read back and encoded in the worker; the result goes into `pixels` without an undo step.
 * A newer change to the same pixels cancels the older job.
 */
export function createPngCache(api: EditorApi, store: DocStore): PngCache {
  const jobs = new Map<string, Job>();
  let position = store.position();
  let disposed = false;

  function start(id: LayerId, target: PixelTarget, source: LayerPixels): Job | null {
    const size = api.pixelSize(id, target);
    if (!size) return null;
    const data = api.readRegion(id, target, { x: 0, y: 0, ...size });
    if (api.gl.isContextLost()) return null; // the read gave nothing real
    const ctl = new AbortController();
    const input = { ...size, channels: target === "image" ? (4 as const) : (1 as const), data };
    const key = `${target}:${id}`;
    const done = api.runInWorker({ kind: "encodePng", input }, [data.buffer], ctl.signal).then(
      (png) => {
        if (jobs.get(key)?.ctl === ctl) jobs.delete(key);
        store.dispatch((doc) => {
          const entry = doc.pixels.get(id);
          if (entry?.[target] !== source) return doc;
          const pixels = new Map(doc.pixels);
          pixels.set(id, { ...entry, [target]: { kind: "gpu", png } });
          return { ...doc, pixels };
        });
      },
      () => {
        // Cancelled or failed: saving reads the GPU instead.
        if (jobs.get(key)?.ctl === ctl) jobs.delete(key);
      },
    );
    return { source, ctl, done };
  }

  function scan(): void {
    if (disposed || api.gl.isContextLost()) return;
    const wanted = new Set<string>();
    for (const [id, entry] of store.get().pixels) {
      for (const target of TARGETS) {
        const source = entry[target];
        if (source?.kind !== "gpu" || source.png) continue;
        const key = `${target}:${id}`;
        wanted.add(key);
        if (jobs.get(key)?.source === source) continue;
        jobs.get(key)?.ctl.abort();
        jobs.delete(key);
        const job = start(id, target, source);
        if (job) jobs.set(key, job);
      }
    }
    for (const [key, job] of jobs) {
      if (wanted.has(key)) continue;
      job.ctl.abort();
      jobs.delete(key);
    }
  }

  // Undo puts its pixels back after the store changes, so the read waits for a microtask.
  const unsubscribe = store.subscribe(() => {
    if (store.position() === position) return;
    position = store.position();
    queueMicrotask(scan);
  });
  queueMicrotask(scan);

  return {
    async idle() {
      await Promise.resolve(); // let a queued scan start its jobs
      while (jobs.size > 0) await Promise.all([...jobs.values()].map((j) => j.done));
    },
    dispose() {
      disposed = true;
      unsubscribe();
      for (const job of jobs.values()) job.ctl.abort();
      jobs.clear();
    },
  };
}
