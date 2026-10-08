/**
 * Adapted from opencut-classic apps/web/src/services/video-cache/service.ts
 * @cf5e79e919144200294fb9fed22a222592a0aeea, MIT, Copyright 2025-2026 OpenCut
 */
import { CanvasSink, type WrappedCanvas } from "mediabunny";
import { ViewerError } from "../../contract/errors";
import type { OpenedMedia } from "../../media";
import type { AssetStore } from "./assets";

/** Forward requests within this many seconds of the last one walk the iterator instead of seeking. */
const ITERATE_WINDOW = 2;

type SinkState = {
  media: OpenedMedia;
  sink: CanvasSink;
  iterator: AsyncGenerator<WrappedCanvas, void, unknown> | null;
  current: WrappedCanvas | null;
  next: WrappedCanvas | null;
  lastTime: number;
  prefetch: Promise<void> | null;
  generation: number;
  chain: Promise<unknown>;
};

function covers(frame: WrappedCanvas, seconds: number): boolean {
  return seconds >= frame.timestamp && seconds < frame.timestamp + frame.duration;
}

export class FrameCache {
  readonly #assets: AssetStore;
  readonly #states = new Map<string, SinkState>();
  readonly #offEvict: () => void;
  #disposed = false;

  constructor(assets: AssetStore) {
    this.#assets = assets;
    this.#offEvict = assets.onEvict((id) => this.drop(id));
  }

  /** Requests for one asset run in order; a request superseded before it starts gets the current frame. */
  async frameAt(assetId: string, seconds: number): Promise<WrappedCanvas | null> {
    const s = await this.#state(assetId);
    const generation = ++s.generation;
    const run = s.chain.then(() =>
      generation === s.generation ? this.#resolve(s, seconds) : s.current,
    );
    s.chain = run.catch(() => undefined);
    return run;
  }

  /** Builds the sink and seeks to `seconds`, unless the asset is already being read. */
  preload(assetId: string, seconds: number): void {
    void this.#preload(assetId, seconds).catch(() => undefined);
  }

  async #preload(assetId: string, seconds: number): Promise<void> {
    const s = await this.#state(assetId);
    if (s.iterator) return;
    s.chain = s.chain
      .then(() => (s.iterator ? null : this.#seek(s, seconds)))
      .catch(() => undefined);
  }

  drop(assetId: string): void {
    const s = this.#states.get(assetId);
    if (!s) return;
    this.#states.delete(assetId);
    s.generation++;
    this.#close(s);
  }

  dispose(): void {
    this.#disposed = true;
    this.#offEvict();
    for (const id of this.#states.keys()) this.drop(id);
  }

  async #state(assetId: string): Promise<SinkState> {
    const media = await this.#assets.media(assetId);
    if (this.#disposed) throw new DOMException("frame cache disposed", "AbortError");
    const hit = this.#states.get(assetId);
    if (hit?.media === media) return hit;
    if (hit) this.#close(hit);
    if (!media.video) throw new ViewerError("unsupported");
    const s: SinkState = {
      media,
      sink: new CanvasSink(media.video, { poolSize: 2 }),
      iterator: null,
      current: null,
      next: null,
      lastTime: -1,
      prefetch: null,
      generation: 0,
      chain: Promise.resolve(),
    };
    this.#states.set(assetId, s);
    return s;
  }

  async #resolve(s: SinkState, seconds: number): Promise<WrappedCanvas | null> {
    if (s.next && s.next.timestamp <= seconds) {
      s.current = s.next;
      s.next = null;
    }
    if (s.current && covers(s.current, seconds)) {
      this.#prefetch(s);
      return s.current;
    }
    if (s.iterator && s.current && seconds >= s.lastTime && seconds < s.lastTime + ITERATE_WINDOW) {
      const frame = await this.#iterate(s, seconds);
      if (frame) {
        this.#prefetch(s);
        return frame;
      }
    }
    const frame = await this.#seek(s, seconds);
    if (frame) this.#prefetch(s);
    return frame;
  }

  async #iterate(s: SinkState, seconds: number): Promise<WrappedCanvas | null> {
    try {
      while (s.iterator) {
        if (s.prefetch) await s.prefetch;
        if (s.next && s.next.timestamp <= seconds) {
          s.current = s.next;
          s.next = null;
        } else {
          if (!s.iterator) break;
          const { value, done } = await s.iterator.next();
          if (done) break;
          s.current = value;
        }
        const frame = s.current;
        s.lastTime = frame.timestamp;
        if (covers(frame, seconds)) return frame;
        if (frame.timestamp > seconds + 1) break;
      }
    } catch {
      s.iterator = null;
    }
    return null;
  }

  async #seek(s: SinkState, seconds: number): Promise<WrappedCanvas | null> {
    if (s.prefetch) await s.prefetch;
    if (s.iterator) await s.iterator.return();
    s.next = null;
    s.lastTime = seconds;
    s.iterator = s.sink.canvases(seconds);
    try {
      const { value, done } = await s.iterator.next();
      if (done) return null;
      s.current = value;
      return value;
    } catch (e) {
      s.iterator = null;
      throw e;
    }
  }

  #prefetch(s: SinkState): void {
    const iterator = s.iterator;
    if (s.prefetch || !iterator || s.next) return;
    s.prefetch = (async () => {
      try {
        const { value, done } = await iterator.next();
        if (!done && s.iterator === iterator) s.next = value;
      } catch {
        if (s.iterator === iterator) s.iterator = null;
      } finally {
        s.prefetch = null;
      }
    })();
  }

  #close(s: SinkState): void {
    const iterator = s.iterator;
    s.iterator = null;
    s.current = null;
    s.next = null;
    if (iterator) void iterator.return().catch(() => undefined);
  }
}
