import { AudioBufferSink, CanvasSink } from "mediabunny";
import { ViewerError } from "../../contract/errors";
import type { OpenedMedia } from "../../media";
import type { AssetStore } from "./assets";

export const THUMB_HEIGHT = 48;
export const MAX_THUMBS = 300;
export const MAX_PEAKS = 64;

type StripSink = { media: OpenedMedia; sink: CanvasSink; chain: Promise<unknown> };

function disposedError(): DOMException {
  return new DOMException("thumbnails disposed", "AbortError");
}

/** Inserts at the newest end of an insertion-ordered map and returns the entries pushed out past `max`. */
function remember<V>(map: Map<string, V>, key: string, value: V, max: number): V[] {
  map.delete(key);
  map.set(key, value);
  const out: V[] = [];
  for (const [k, v] of map) {
    if (map.size <= max) break;
    map.delete(k);
    out.push(v);
  }
  return out;
}

function touch<V>(map: Map<string, V>, key: string): V | undefined {
  const hit = map.get(key);
  if (hit !== undefined) remember(map, key, hit, Infinity);
  return hit;
}

export class Thumbnails {
  readonly #assets: AssetStore;
  readonly #sinks = new Map<string, StripSink>();
  readonly #bitmaps = new Map<string, ImageBitmap>();
  readonly #peaks = new Map<string, Float32Array>();
  readonly #offEvict: () => void;
  #disposed = false;

  constructor(assets: AssetStore) {
    this.#assets = assets;
    this.#offEvict = assets.onEvict((id) => this.#sinks.delete(id));
  }

  /** One bitmap per requested time, cached to the nearest 0.1 s; `null` past the end of the video. */
  async strip(assetId: string, seconds: number[]): Promise<(ImageBitmap | null)[]> {
    const keyOf = (s: number) => `${assetId}:${(Math.round(s * 10) / 10).toFixed(1)}`;
    const missing = new Map<string, number>();
    for (const s of seconds) {
      const key = keyOf(s);
      if (!this.#bitmaps.has(key)) missing.set(key, s);
    }
    if (missing.size > 0) await this.#decode(assetId, missing);
    return seconds.map((s) => touch(this.#bitmaps, keyOf(s)) ?? null);
  }

  async #decode(assetId: string, missing: Map<string, number>): Promise<void> {
    const s = await this.#sink(assetId);
    const run = s.chain.then(async () => {
      const keys = [...missing.keys()];
      let i = 0;
      for await (const frame of s.sink.canvasesAtTimestamps(missing.values())) {
        const key = keys[i++]!;
        if (!frame) continue;
        // oxlint-disable-next-line no-await-in-loop -- the sink reuses one canvas, so copy it before the next frame
        const bitmap = await createImageBitmap(frame.canvas);
        if (this.#disposed) {
          bitmap.close();
          throw disposedError();
        }
        for (const old of remember(this.#bitmaps, key, bitmap, MAX_THUMBS)) old.close();
      }
    });
    s.chain = run.catch(() => undefined);
    await run;
  }

  async #sink(assetId: string): Promise<StripSink> {
    const media = await this.#assets.media(assetId);
    if (this.#disposed) throw disposedError();
    const hit = this.#sinks.get(assetId);
    if (hit?.media === media) return hit;
    if (!media.video) throw new ViewerError("unsupported");
    const s: StripSink = {
      media,
      sink: new CanvasSink(media.video, { height: THUMB_HEIGHT, poolSize: 1 }),
      chain: Promise.resolve(),
    };
    this.#sinks.set(assetId, s);
    return s;
  }

  /** Per-bucket peak of |sample| across channels over [from, to) source seconds; all zero without audio. */
  async peaks(assetId: string, from: number, to: number, buckets: number): Promise<Float32Array> {
    const key = `${assetId}:${from}:${to}:${buckets}`;
    const hit = touch(this.#peaks, key);
    if (hit) return hit;
    const media = await this.#assets.media(assetId);
    if (this.#disposed) throw disposedError();
    const out = new Float32Array(buckets);
    if (!media.audio || to <= from) return out;
    const scale = buckets / (to - from);
    for await (const { buffer, timestamp } of new AudioBufferSink(media.audio).buffers(from, to)) {
      const rate = buffer.sampleRate;
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          const b = Math.floor((timestamp + i / rate - from) * scale);
          if (b < 0 || b >= buckets) continue;
          const v = Math.abs(data[i]!);
          if (v > out[b]!) out[b] = v;
        }
      }
    }
    if (this.#disposed) throw disposedError();
    remember(this.#peaks, key, out, MAX_PEAKS);
    return out;
  }

  dispose(): void {
    this.#disposed = true;
    this.#offEvict();
    for (const bitmap of this.#bitmaps.values()) bitmap.close();
    this.#bitmaps.clear();
    this.#peaks.clear();
    this.#sinks.clear();
  }
}
