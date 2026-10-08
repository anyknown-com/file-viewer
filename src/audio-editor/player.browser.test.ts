import { AudioBufferSink } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ViewerError } from "../contract/errors";
import { type AudioEdit, cut, fade, initialEdit, outputDuration, type Range } from "./edit";
import { type OpenedTrack, openTrack } from "./open-track";
import { createPlayer, type Player } from "./player";
import { synthWavSource } from "./testing/synth-wav";

const RATE = 48000;
/** Largest step between neighbouring samples of the 0.5 sine, plus 10%. */
const MAX_STEP = ((2 * Math.PI * 440) / RATE) * 0.5 * 1.1;

/** 440 Hz at 0.5, cosine phase so the very first source sample is loud and a fade-in shows. */
const tone = (t: number) => 0.5 * Math.cos(2 * Math.PI * 440 * t);

let opened: OpenedTrack | null = null;
let player: Player | null = null;
const onError = vi.fn<(e: ViewerError) => void>();

afterEach(() => {
  player?.dispose();
  opened?.dispose();
  player = null;
  opened = null;
  onError.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open(seconds: number): Promise<OpenedTrack> {
  opened = await openTrack(
    synthWavSource({ seconds, sampleRate: RATE, channels: 1, tone }),
    new AbortController().signal,
  );
  return opened;
}

/** Plays `edit` from `from` for `seconds` into an offline context and returns channel 0. */
async function render(
  edit: AudioEdit,
  o: { source: number; from: number; seconds: number; loop?: Range },
): Promise<Float32Array> {
  const t = await open(o.source);
  const ctx = new OfflineAudioContext(2, RATE * o.seconds, RATE);
  player = createPlayer(ctx, t.track, () => ({ edit, loop: o.loop ?? null }), onError);
  player.play(o.from);
  await player.pump(o.seconds);
  const out = await ctx.startRendering();
  expect(out.length).toBe(RATE * o.seconds);
  return out.getChannelData(0);
}

function maxStep(data: Float32Array): number {
  let m = 0;
  for (let i = 1; i < data.length; i++) {
    m = Math.max(m, Math.abs(data[i] - data[i - 1]));
  }
  return m;
}

function longestSilence(data: Float32Array, from: number, to: number): number {
  let run = 0;
  let longest = 0;
  for (let i = from; i < to; i++) {
    run = data[i] === 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

describe("createPlayer", () => {
  it("loops a 2 s selection five times without gaps or clicks", async () => {
    const data = await render(initialEdit(4), {
      source: 4,
      from: 1,
      seconds: 10,
      loop: { start: 1, end: 3 },
    });
    expect(longestSilence(data, 2 * RATE - 480, 2 * RATE + 480)).toBeLessThanOrEqual(1);
    expect(longestSilence(data, 0, data.length)).toBeLessThanOrEqual(1);
    expect(maxStep(data)).toBeLessThanOrEqual(MAX_STEP);
    // Each pass replays the same source: 0.5 s into the 3rd pass matches 0.5 s into the 1st.
    expect(data[4.5 * RATE]).toBeCloseTo(data[0.5 * RATE], 3);
  });

  it("fades both sides of a loop that does not end on a whole cycle", async () => {
    const data = await render(initialEdit(4), {
      source: 4,
      from: 1,
      seconds: 4,
      loop: { start: 1.0003, end: 2.2101 },
    });
    expect(maxStep(data)).toBeLessThanOrEqual(MAX_STEP);
  });

  it("smooths the cut point of a deleted range", async () => {
    const edit = cut(initialEdit(4), { start: 1.0003, end: 2.1001 });
    const data = await render(edit, { source: 4, from: 0, seconds: 2 });
    expect(longestSilence(data, 0, data.length)).toBeLessThanOrEqual(1);
    expect(maxStep(data)).toBeLessThanOrEqual(MAX_STEP);
  });

  it("starts at 0 with a fade-in", async () => {
    const edit = fade(initialEdit(2), { start: 0, end: 0.5 }, "in");
    const data = await render(edit, { source: 2, from: 0, seconds: 1 });
    expect(data[0]).toBe(0);
    expect(Math.abs(data[0.75 * RATE])).toBeGreaterThan(0);
  });

  it("rejects a failed read with decode_failed and reports it", async () => {
    const t = await open(2);
    vi.spyOn(AudioBufferSink.prototype, "buffers").mockImplementation(() => {
      throw new Error("boom");
    });
    const ctx = new OfflineAudioContext(2, RATE, RATE);
    const edit = initialEdit(2);
    player = createPlayer(ctx, t.track, () => ({ edit, loop: null }), onError);
    player.play(0);
    await expect(player.pump(1)).rejects.toMatchObject({ code: "decode_failed" });
    expect(player.playing()).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].code).toBe("decode_failed");
  });

  it("stops at the end when no animation frame arrives", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    const t = await open(0.5);
    const ctx = new AudioContext();
    const edit = initialEdit(t.duration);
    const p = createPlayer(ctx, t.track, () => ({ edit, loop: null }), onError);
    player = p;
    // The AudioContext clock only runs after a user gesture.
    const button = document.createElement("button");
    button.textContent = "play";
    button.addEventListener("click", () => p.play(0));
    document.body.append(button);
    await userEvent.click(button);
    button.remove();
    expect(p.playing()).toBe(true);
    await vi.waitFor(() => expect(p.playing()).toBe(false), { timeout: 3000 });
    expect(p.position()).toBe(outputDuration(edit));
    expect(onError).not.toHaveBeenCalled();
    await ctx.close();
  });
});
