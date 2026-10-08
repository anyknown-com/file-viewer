import { AudioBufferSink, type InputAudioTrack } from "mediabunny";
import type { ViewerError } from "../contract/errors";
import { toMediaError } from "../media";
import { type AudioEdit, type Gain, outputDuration, type Range } from "./edit";
import { applyGains, downmixToStereo } from "./gain";
import { type Block, plan } from "./plan";

export type Player = {
  play(from: number): void;
  pause(): void;
  seek(t: number): void;
  position(): number;
  playing(): boolean;
  pump(until: number): Promise<void>;
  dispose(): void;
};

type State = { edit: AudioEdit; loop: Range | null };

const EPS = 1e-9;
const TICK_MS = 250;
const AHEAD = 1;
const SEAM_SECONDS = 0.005;

/**
 * A 5 ms fade out into and in from `t`, like the seams between segments. Both sides reach 0 at
 * `t`, so samples just past a block edge that Web Audio interpolates into stay silent.
 */
function seamAt(t: number): Gain[] {
  return [
    { id: "seam-out", kind: "fadeOut", start: t - SEAM_SECONDS, end: t },
    { id: "seam-in", kind: "fadeIn", start: t, end: t + SEAM_SECONDS },
  ];
}

/** The loop that `plan` actually uses: clamped to the edit, null when empty. */
function loopOf(s: State): Range | null {
  if (!s.loop) return null;
  const end = Math.min(s.loop.end, outputDuration(s.edit));
  return end - s.loop.start > EPS ? { start: s.loop.start, end } : null;
}

/** Output time `elapsed` seconds after starting at `from`, walking the way `plan` does. */
function walk(s: State, from: number, elapsed: number): number {
  const loop = loopOf(s);
  if (!loop) return Math.min(from + elapsed, outputDuration(s.edit));
  const first = from >= loop.end - EPS ? loop.start : from;
  const t = first + elapsed;
  if (t < loop.end - EPS) return t;
  return loop.start + ((t - loop.end) % (loop.end - loop.start));
}

/**
 * Plays the edit on `ctx`. Scheduling, the end of playback and edit changes run on a timer,
 * never on requestAnimationFrame: rAF stalls in hidden or busy tabs while the audio clock runs.
 */
export function createPlayer(
  ctx: BaseAudioContext,
  track: InputAudioTrack,
  getState: () => State,
  onError: (e: ViewerError) => void,
): Player {
  let on = false;
  let paused = 0;
  /** Clock and output time where playback last (re)started, and the state it plans with. */
  let clockStart = 0;
  let from = 0;
  let state: State = getState();
  /** Seconds after `clockStart` already handed to the scheduler. */
  let scheduled = 0;
  /** Bumped by pause and seek so reads still in flight drop their results. */
  let generation = 0;
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const nodes = new Set<AudioBufferSourceNode>();

  const elapsed = () => Math.max(0, ctx.currentTime - clockStart);
  const position = () => (on ? walk(state, from, elapsed()) : paused);

  const stopAudio = () => {
    generation++;
    clearTimeout(timer);
    for (const node of nodes) node.stop();
    nodes.clear();
  };

  const pause = () => {
    if (!on) return;
    paused = position();
    on = false;
    stopAudio();
  };

  const start = (t: number) => {
    stopAudio();
    state = getState();
    on = true;
    clockStart = ctx.currentTime;
    from = Math.max(0, Math.min(t, outputDuration(state.edit)));
    scheduled = 0;
    // The first pump runs on the next task, so a caller that pumps right away schedules first.
    timer = setTimeout(tick, 0);
  };

  const tick = () => {
    clearTimeout(timer);
    if (!on) return;
    const now = getState();
    if (
      now.edit !== state.edit ||
      now.loop?.start !== state.loop?.start ||
      now.loop?.end !== state.loop?.end
    ) {
      start(position());
      return;
    }
    const left = loopOf(state) ? Infinity : outputDuration(state.edit) - from - elapsed();
    if (left <= 0) {
      pause();
      return;
    }
    pump(ctx.currentTime + AHEAD).catch(() => undefined);
    timer = setTimeout(tick, Math.min(TICK_MS, left * 1000));
  };

  const pump = (until: number): Promise<void> => {
    if (!on) return chain;
    const target = until - clockStart;
    if (target <= scheduled + EPS) return chain;
    const base = scheduled;
    scheduled = target;
    const at = walk(state, from, base);
    const loop = loopOf(state);
    // Starting at loop.start after base seconds means the loop just wrapped there.
    const wrapped =
      loop !== null &&
      Math.abs(at - loop.start) <= 1e-6 &&
      (from >= loop.end - EPS ? loop.start : from) + base >= loop.end - 1e-6;
    const blocks = plan(state.edit, at, at + (target - base), state.loop);
    const job = { blocks, at, wrapped, when: clockStart + base, state, generation };
    chain = chain
      .then(() => scheduleAll(job))
      .catch((e: unknown) => {
        const current = job.generation === generation;
        if (current) pause();
        // toMediaError throws an abort as is, so only real failures reach onError.
        const error = toMediaError(e, "decode_failed");
        if (current) onError(error);
        throw error;
      });
    const result = chain;
    // Keep the chain alive for the next pump; the caller still sees this pump's rejection.
    chain = chain.catch(() => undefined);
    return result;
  };

  type Job = {
    blocks: Block[];
    at: number;
    wrapped: boolean;
    when: number;
    state: State;
    generation: number;
  };

  const scheduleAll = async (job: Job) => {
    const loop = loopOf(job.state);
    let cursor = loop && job.at >= loop.end - EPS ? loop.start : job.at;
    let wrapped = job.wrapped;
    for (const b of job.blocks) {
      if (job.generation !== generation) return;
      const len = b.srcEnd - b.srcStart;
      const extra: Gain[] = [];
      if (loop && wrapped && Math.abs(cursor - loop.start) <= EPS)
        extra.push(...seamAt(loop.start));
      if (loop && Math.abs(cursor + len - loop.end) <= 1e-6) extra.push(...seamAt(loop.end));
      const edit = { ...job.state.edit, gains: [...job.state.edit.gains, ...extra] };
      // oxlint-disable-next-line no-await-in-loop -- blocks are read and scheduled in output order.
      await scheduleBlock(b, cursor, job.when + (b.outStart - job.at), edit, job.generation);
      cursor += len;
      wrapped = false;
      if (loop && cursor >= loop.end - 1e-6) {
        cursor = loop.start;
        wrapped = true;
      }
    }
  };

  /** Schedules one block whose output time is `out`, starting on the context clock at `when`. */
  const scheduleBlock = async (
    b: Block,
    out: number,
    when: number,
    edit: AudioEdit,
    gen: number,
  ) => {
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(
      b.srcStart,
      b.srcEnd,
    )) {
      if (gen !== generation) return;
      let offset = Math.max(0, b.srcStart - timestamp);
      let duration = Math.min(buffer.duration, b.srcEnd - timestamp) - offset;
      let at = when + (timestamp + offset - b.srcStart);
      const late = ctx.currentTime - at;
      if (late > 0) {
        offset += late;
        at += late;
        duration -= late;
      }
      if (duration <= 0) continue;
      const planes = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c),
      );
      const mixed = downmixToStereo(planes);
      applyGains(mixed, out + (timestamp - b.srcStart), buffer.sampleRate, edit);
      let playable = buffer;
      if (mixed !== planes) {
        playable = ctx.createBuffer(mixed.length, buffer.length, buffer.sampleRate);
        mixed.forEach((p, c) => playable.copyToChannel(p as Float32Array<ArrayBuffer>, c));
      }
      const node = ctx.createBufferSource();
      node.buffer = playable;
      node.connect(ctx.destination);
      node.addEventListener("ended", () => nodes.delete(node));
      nodes.add(node);
      node.start(at, offset, duration);
    }
  };

  return {
    play(t) {
      const s = getState();
      const end = outputDuration(s.edit);
      if (ctx instanceof AudioContext) ctx.resume().catch(() => undefined);
      start(!loopOf(s) && t >= end - EPS ? 0 : t);
    },
    pause,
    seek(t) {
      if (on) start(t);
      else paused = Math.max(0, Math.min(t, outputDuration(getState().edit)));
    },
    position,
    playing: () => on,
    pump,
    dispose() {
      pause();
    },
  };
}
