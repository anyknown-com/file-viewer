import { readBlob, type ByteSource, type FileRef } from "../../contract/byte-source";
import { isAbortError, ViewerError, type ViewerErrorCode } from "../../contract/errors";
import { formatOf, mimeOf } from "../../contract/kinds";
import type { AssetProvider } from "../../contract/props";
import { openMedia, toMediaError, type OpenedMedia } from "../../media";
import { SOURCE_ASSET_ID, type AssetKind, type AssetMeta } from "../model/project";
import { secondsToTicks } from "../model/time";

export const MAX_OPEN_INPUTS = 8;
export const MAX_IMAGE_BYTES = 64 * 1024 ** 2;

export type AssetEntry = { id: string; name: string; mime: string; size: number; kind: AssetKind };
export type AssetStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; info: AssetMeta }
  | { state: "unsupported"; code: ViewerErrorCode };

const IDLE: AssetStatus = { state: "idle" };

function disposedError(): DOMException {
  return new DOMException("asset store disposed", "AbortError");
}

export class AssetStore {
  readonly #file: FileRef;
  readonly #provider: AssetProvider | undefined;
  readonly #signal: AbortSignal;
  #entries = new Map<string, AssetEntry>();
  readonly #status = new Map<string, AssetStatus>();
  readonly #loading = new Map<string, Promise<AssetMeta>>();
  /** Insertion order is recency: the first key is the least recently used. */
  readonly #pool = new Map<string, OpenedMedia>();
  readonly #opening = new Map<string, Promise<OpenedMedia>>();
  readonly #images = new Map<string, ImageBitmap>();
  readonly #listeners = new Set<() => void>();
  readonly #evictListeners = new Set<(id: string) => void>();
  readonly #onAbort = () => this.dispose();
  #disposed = false;

  constructor(o: { file: FileRef; provider?: AssetProvider; signal: AbortSignal }) {
    this.#file = o.file;
    this.#provider = o.provider;
    this.#signal = o.signal;
    const source = this.#sourceEntry();
    this.#entries.set(source.id, source);
    if (o.signal.aborted) this.#disposed = true;
    else o.signal.addEventListener("abort", this.#onAbort, { once: true });
  }

  async list(): Promise<AssetEntry[]> {
    const out = [this.#sourceEntry()];
    for (const info of this.#provider ? await this.#provider.list() : []) {
      const kind = formatOf(info);
      if (kind !== "video" && kind !== "audio" && kind !== "image") continue;
      out.push({ id: info.id, name: info.name, mime: mimeOf(info), size: info.size, kind });
    }
    this.#entries = new Map(out.map((e) => [e.id, e]));
    return out;
  }

  status(id: string): AssetStatus {
    return this.#status.get(id) ?? IDLE;
  }

  load(id: string): Promise<AssetMeta> {
    const s = this.status(id);
    if (s.state === "ready") return Promise.resolve(s.info);
    const pending = this.#loading.get(id);
    if (pending) return pending;
    const p = this.#load(id, s).finally(() => this.#loading.delete(id));
    this.#loading.set(id, p);
    return p;
  }

  async #load(id: string, before: AssetStatus): Promise<AssetMeta> {
    this.#setStatus(id, { state: "loading" });
    try {
      const entry = this.#entry(id);
      const info =
        entry.kind === "image" ? await this.#probeImage(entry) : await this.#probeMedia(entry);
      this.#setStatus(id, { state: "ready", info });
      return info;
    } catch (e) {
      if (isAbortError(e) || this.#signal.aborted || this.#disposed) {
        this.#setStatus(id, before);
        throw e;
      }
      const err = e instanceof ViewerError ? e : toMediaError(e, "decode_failed");
      this.#setStatus(id, { state: "unsupported", code: err.code });
      throw err;
    }
  }

  async #probeMedia(entry: AssetEntry): Promise<AssetMeta> {
    const media = await this.media(entry.id);
    const base = {
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      duration: secondsToTicks(media.duration),
      hasAudio: media.audio !== null,
    };
    if (!media.video) return { ...base, width: 0, height: 0, fps: null };
    const [width, height, stats] = await Promise.all([
      media.video.getDisplayWidth(),
      media.video.getDisplayHeight(),
      media.video.computePacketStats(100),
    ]);
    const fps = stats.averagePacketRate > 0 ? stats.averagePacketRate : null;
    return { ...base, width, height, fps };
  }

  async #probeImage(entry: AssetEntry): Promise<AssetMeta> {
    const bitmap = await this.#bitmap(entry);
    return {
      id: entry.id,
      name: entry.name,
      kind: "image",
      duration: null,
      width: bitmap.width,
      height: bitmap.height,
      fps: null,
      hasAudio: false,
    };
  }

  async #bitmap(entry: AssetEntry): Promise<ImageBitmap> {
    const source = await this.#source(entry.id);
    if (source.size > MAX_IMAGE_BYTES) throw new ViewerError("too_large");
    const blob = await readBlob(source, { type: entry.mime, signal: this.#signal });
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch (e) {
      throw new ViewerError("decode_failed", { cause: e });
    }
    if (this.#disposed) {
      bitmap.close();
      throw disposedError();
    }
    this.#images.get(entry.id)?.close();
    this.#images.set(entry.id, bitmap);
    return bitmap;
  }

  async media(id: string): Promise<OpenedMedia> {
    const hit = this.#pool.get(id);
    if (hit) {
      this.#pool.delete(id);
      this.#pool.set(id, hit);
      return hit;
    }
    const pending = this.#opening.get(id);
    if (pending) return pending;
    const p = this.#open(id).finally(() => this.#opening.delete(id));
    this.#opening.set(id, p);
    return p;
  }

  async #open(id: string): Promise<OpenedMedia> {
    const entry = this.#entry(id);
    if (entry.kind === "image") throw new ViewerError("unsupported");
    if (this.#disposed) throw disposedError();
    const media = await openMedia(await this.#source(id), entry.kind, this.#signal);
    if (this.#disposed) {
      media.dispose();
      throw disposedError();
    }
    this.#pool.set(id, media);
    for (const [oldId, old] of this.#pool) {
      if (this.#pool.size <= MAX_OPEN_INPUTS) break;
      this.#pool.delete(oldId);
      old.dispose();
      for (const l of this.#evictListeners) l(oldId);
    }
    return media;
  }

  async image(id: string): Promise<ImageBitmap> {
    const hit = this.#images.get(id);
    if (hit) return hit;
    await this.load(id);
    const bitmap = this.#images.get(id);
    if (!bitmap) throw new ViewerError("unsupported");
    return bitmap;
  }

  onEvict(listener: (id: string) => void): () => void {
    this.#evictListeners.add(listener);
    return () => this.#evictListeners.delete(listener);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    this.#disposed = true;
    this.#signal.removeEventListener("abort", this.#onAbort);
    for (const media of this.#pool.values()) media.dispose();
    for (const bitmap of this.#images.values()) bitmap.close();
    this.#pool.clear();
    this.#images.clear();
  }

  #sourceEntry(): AssetEntry {
    const f = this.#file;
    return {
      id: SOURCE_ASSET_ID,
      name: f.name,
      mime: mimeOf(f),
      size: f.source.size,
      kind: "video",
    };
  }

  #entry(id: string): AssetEntry {
    const entry = this.#entries.get(id);
    if (!entry) throw new ViewerError("unsupported", { message: `unknown asset ${id}` });
    return entry;
  }

  async #source(id: string): Promise<ByteSource> {
    if (id === SOURCE_ASSET_ID) return this.#file.source;
    if (!this.#provider) throw new ViewerError("unsupported");
    return this.#provider.open(id);
  }

  #setStatus(id: string, status: AssetStatus): void {
    this.#status.set(id, status);
    for (const l of this.#listeners) l();
  }
}
