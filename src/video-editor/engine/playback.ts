import { AudioBufferSink } from "mediabunny";
import { isAbortError, type ViewerError } from "../../contract/errors";
import { toMediaError } from "../../media";
import { clipEnd, type Project, projectDuration } from "../model/project";
import { frameTicks, secondsToTicks, type Ticks, ticksToSeconds } from "../model/time";
import type { AssetStore } from "./assets";
import { type AudioSegment, audioSegments } from "./audio-plan";
import type { FrameCache } from "./frame-cache";
import { type FrameSources, renderFrame } from "./render-frame";

/** Audio is scheduled in chunks of this length once less than one chunk is left ahead of the playhead. */
const AUDIO_CHUNK = secondsToTicks(1);
/** The next main clip is preloaded when the playhead is this close to the end of the current one. */
const PRELOAD_AHEAD = secondsToTicks(1);

type PlayerOptions = {
  assets: AssetStore;
  frames: FrameCache;
  getProject(): Project;
  onTime(t: Ticks): void;
  onError(e: ViewerError): void;
};

export class Player {
  readonly #o: PlayerOptions;
  readonly #sources: FrameSources;
  #ctx2d: CanvasRenderingContext2D | null = null;
  #audio: AudioContext | null = null;
  #playing = false;
  #time: Ticks = 0;
  /** `AudioContext.currentTime` and playhead when the clock last started. */
  #clockStart = 0;
  #timeStart: Ticks = 0;
  #scheduledUntil: Ticks = 0;
  /** Bumped by pause and seek so audio reads still in flight drop their results. */
  #generation = 0;
  #nodes = new Set<AudioBufferSourceNode>();
  #raf = 0;
  #drawing = false;
  #drawAgain = false;

  constructor(o: PlayerOptions) {
    this.#o = o;
    this.#sources = {
      frame: async (id, seconds) => (await o.frames.frameAt(id, seconds))?.canvas ?? null,
      image: (id) => o.assets.image(id),
    };
  }

  get playing(): boolean {
    return this.#playing;
  }

  get time(): Ticks {
    return this.#playing ? this.#clock() : this.#time;
  }

  attach(canvas: HTMLCanvasElement): () => void {
    const audio = new AudioContext();
    this.#ctx2d = canvas.getContext("2d");
    this.#audio = audio;
    this.redraw();
    return () => {
      this.pause();
      audio.close().catch(() => undefined);
      if (this.#audio === audio) {
        this.#audio = null;
        this.#ctx2d = null;
      }
    };
  }

  play(): void {
    const audio = this.#audio;
    if (this.#playing || !audio) return;
    if (this.#time >= projectDuration(this.#o.getProject())) this.#time = 0;
    audio.resume().catch(() => undefined);
    this.#playing = true;
    this.#startClock();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  pause(): void {
    if (!this.#playing) return;
    this.#time = this.#clock();
    this.#playing = false;
    cancelAnimationFrame(this.#raf);
    this.#stopAudio();
    this.#o.onTime(this.#time);
  }

  toggle(): void {
    if (this.#playing) this.pause();
    else this.play();
  }

  seek(t: Ticks): void {
    this.#time = Math.max(0, Math.min(Math.round(t), projectDuration(this.#o.getProject())));
    if (this.#playing) {
      this.#stopAudio();
      this.#startClock();
    }
    this.#o.onTime(this.#time);
    this.redraw();
  }

  step(frames: number): void {
    this.pause();
    this.seek(this.#time + frames * frameTicks(this.#o.getProject().fps));
  }

  jump(seconds: number): void {
    this.seek(this.time + secondsToTicks(seconds));
  }

  redraw(): void {
    if (!this.#ctx2d) return;
    if (this.#drawing) {
      this.#drawAgain = true;
      return;
    }
    this.#drawing = true;
    const ctx = this.#ctx2d;
    const p = this.#o.getProject();
    if (ctx.canvas.width !== p.width) ctx.canvas.width = p.width;
    if (ctx.canvas.height !== p.height) ctx.canvas.height = p.height;
    renderFrame(ctx, p, this.time, this.#sources)
      .catch((e: unknown) => this.#fail(e))
      .finally(() => {
        this.#drawing = false;
        if (!this.#drawAgain) return;
        this.#drawAgain = false;
        this.redraw();
      });
  }

  dispose(): void {
    this.pause();
    this.#audio?.close().catch(() => undefined);
    this.#audio = null;
    this.#ctx2d = null;
  }

  #clock(): Ticks {
    const elapsed = (this.#audio?.currentTime ?? this.#clockStart) - this.#clockStart;
    const t = this.#timeStart + secondsToTicks(elapsed);
    return Math.min(t, projectDuration(this.#o.getProject()));
  }

  #startClock(): void {
    this.#generation++;
    this.#clockStart = this.#audio!.currentTime;
    this.#timeStart = this.#time;
    this.#scheduledUntil = this.#time;
  }

  #tick = (): void => {
    if (!this.#playing) return;
    const p = this.#o.getProject();
    const t = this.#clock();
    this.#time = t;
    if (t >= projectDuration(p)) {
      this.pause();
      this.redraw();
      return;
    }
    this.#o.onTime(t);
    this.redraw();
    if (this.#scheduledUntil - t < AUDIO_CHUNK) this.#scheduleAudio(p);
    this.#preloadNext(p, t);
    this.#raf = requestAnimationFrame(this.#tick);
  };

  #preloadNext(p: Project, t: Ticks): void {
    const clips = p.tracks.main.clips;
    const i = clips.findIndex((c) => c.start <= t && t < clipEnd(c));
    const next = i >= 0 && clipEnd(clips[i]!) - t < PRELOAD_AHEAD ? clips[i + 1] : undefined;
    if (next) this.#o.frames.preload(next.assetId, ticksToSeconds(next.in));
  }

  #scheduleAudio(p: Project): void {
    const from = this.#scheduledUntil;
    const to = from + AUDIO_CHUNK;
    this.#scheduledUntil = to;
    const withAudio = new Set<string>();
    for (const clip of p.tracks.main.clips) {
      const status = this.#o.assets.status(clip.assetId);
      if (status.state === "ready" && status.info.hasAudio) withAudio.add(clip.assetId);
    }
    const generation = this.#generation;
    for (const segment of audioSegments(p, withAudio, from, to)) {
      this.#playSegment(segment, generation).catch((e: unknown) => this.#fail(e));
    }
  }

  async #playSegment(seg: AudioSegment, generation: number): Promise<void> {
    const track = (await this.#o.assets.media(seg.assetId)).audio;
    if (!track || generation !== this.#generation) return;
    const segStart = this.#clockStart + ticksToSeconds(seg.at - this.#timeStart);
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(
      seg.from,
      seg.to,
    )) {
      const audio = this.#audio;
      if (!audio || generation !== this.#generation) return;
      // Play only the part of the buffer inside the segment so chunk edges never overlap.
      let offset = Math.max(0, seg.from - timestamp);
      let when = segStart + Math.max(0, timestamp - seg.from);
      let duration = Math.min(buffer.duration, seg.to - timestamp) - offset;
      const late = audio.currentTime - when;
      if (late > 0) {
        offset += late;
        when += late;
        duration -= late;
      }
      if (duration <= 0) continue;
      const node = audio.createBufferSource();
      const gain = audio.createGain();
      node.buffer = buffer;
      gain.gain.value = seg.gain;
      node.connect(gain).connect(audio.destination);
      node.addEventListener("ended", () => this.#nodes.delete(node));
      this.#nodes.add(node);
      node.start(when, offset, duration);
    }
  }

  #stopAudio(): void {
    this.#generation++;
    for (const node of this.#nodes) node.stop();
    this.#nodes.clear();
  }

  #fail(e: unknown): void {
    this.pause();
    if (!isAbortError(e)) this.#o.onError(toMediaError(e, "decode_failed"));
  }
}
