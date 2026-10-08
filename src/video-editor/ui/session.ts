import type { FileRef } from "../../contract/byte-source";
import { isAbortError, ViewerError } from "../../contract/errors";
import type { AssetProvider } from "../../contract/props";
import { hasVideoCodecs } from "../../media/support";
import { AssetStore } from "../engine/assets";
import { FrameCache } from "../engine/frame-cache";
import { Player } from "../engine/playback";
import { Thumbnails } from "../engine/thumbnails";
import type { Command } from "../model/commands";
import { History } from "../model/history";
import { createProject, type Project, SOURCE_ASSET_ID } from "../model/project";
import type { Ticks } from "../model/time";

export type SessionState = {
  status: "loading" | "ready" | "unsupported";
  error: ViewerError | null;
  selection: ReadonlySet<string>;
  playhead: Ticks;
  pixelsPerSecond: number;
  snapLine: Ticks | null;
};

const INITIAL_PPS = 50;

/**
 * One editing session: the engines, the undo history and the view state the UI reads with
 * `useSyncExternalStore`. `state` is replaced (never mutated) on every change, history changes
 * included, so it doubles as the snapshot.
 */
export class EditorSession {
  readonly assets: AssetStore;
  readonly frames: FrameCache;
  readonly player: Player;
  readonly thumbs: Thumbnails;
  #history: History | null = null;
  #offHistory: (() => void) | null = null;
  #state: SessionState = {
    status: "loading",
    error: null,
    selection: new Set(),
    playhead: 0,
    pixelsPerSecond: INITIAL_PPS,
    snapLine: null,
  };
  readonly #ac = new AbortController();
  readonly #listeners = new Set<() => void>();
  readonly #onError: ((e: ViewerError) => void) | undefined;

  constructor(o: { file: FileRef; provider?: AssetProvider; onError?(e: ViewerError): void }) {
    this.#onError = o.onError;
    this.assets = new AssetStore({ file: o.file, provider: o.provider, signal: this.#ac.signal });
    this.frames = new FrameCache(this.assets);
    this.player = new Player({
      assets: this.assets,
      frames: this.frames,
      getProject: () => this.#project(),
      onTime: (t) => this.#set({ playhead: t }),
      onError: (e) => this.#fail(e),
    });
    this.thumbs = new Thumbnails(this.assets);
  }

  get history(): History | null {
    return this.#history;
  }

  get state(): SessionState {
    return this.#state;
  }

  async start(): Promise<void> {
    if (!hasVideoCodecs()) {
      this.#set({ status: "unsupported", error: new ViewerError("webcodecs_unavailable") });
      return;
    }
    try {
      const info = await this.assets.load(SOURCE_ASSET_ID);
      if (this.#ac.signal.aborted) return;
      const history = new History(createProject(info));
      this.#history = history;
      this.#offHistory = history.subscribe(() => this.#set({}));
      this.#set({ status: "ready" });
    } catch (e) {
      if (this.#ac.signal.aborted || isAbortError(e)) return;
      const error = e instanceof ViewerError ? e : new ViewerError("decode_failed", { cause: e });
      this.#set({ status: "unsupported", error });
      this.#onError?.(error);
    }
  }

  run(c: Command | null): void {
    if (!c || !this.#history) return;
    this.#history.run(c);
    this.player.redraw();
  }

  select(ids: string[], additive: boolean): void {
    this.#set({ selection: new Set(additive ? [...this.#state.selection, ...ids] : ids) });
  }

  setPlayhead(t: Ticks): void {
    this.#set({ playhead: t });
  }

  setZoom(pps: number): void {
    this.#set({ pixelsPerSecond: pps });
  }

  setSnapLine(t: Ticks | null): void {
    if (t === this.#state.snapLine) return;
    this.#set({ snapLine: t });
  }

  subscribe(l: () => void): () => void {
    this.#listeners.add(l);
    return () => {
      this.#listeners.delete(l);
    };
  }

  dispose(): void {
    this.#ac.abort();
    this.#offHistory?.();
    this.player.dispose();
    this.thumbs.dispose();
    this.frames.dispose();
    this.assets.dispose();
  }

  #project(): Project {
    if (!this.#history) throw new Error("video editor: no project before the source is loaded");
    return this.#history.project;
  }

  #fail(error: ViewerError): void {
    this.#set({ error });
    this.#onError?.(error);
  }

  #set(patch: Partial<SessionState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const l of this.#listeners) l();
  }
}
