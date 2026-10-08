import { AudioSampleSink, canEncodeAudio } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import { type AudioEdit, cut, fade, gain, initialEdit, outputDuration } from "./edit";
import { exportAudio } from "./export";
import { estimateBytes, type OutputChoice } from "./formats";
import { normalizeGain } from "./normalize";
import { type OpenedTrack, openTrack } from "./open-track";
import { scanPeaks } from "./scan";
import { synthWavSource } from "./testing/synth-wav";

vi.mock("./formats", { spy: true });

const RATE = 48000;
const WAV: OutputChoice = { format: "wav", bitrate: null };
const signal = () => new AbortController().signal;
const memory = () =>
  (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
const tone = (t: number) => 0.5 * Math.sin(2 * Math.PI * 440 * t);

const opened: OpenedTrack[] = [];
afterEach(() => {
  for (const t of opened.splice(0)) t.dispose();
  vi.restoreAllMocks();
});

async function open(source: Parameters<typeof openTrack>[0]): Promise<OpenedTrack> {
  const t = await openTrack(source, signal());
  opened.push(t);
  return t;
}

const openSynth = (seconds: number, channels = 1, wave = tone) =>
  open(synthWavSource({ seconds, sampleRate: RATE, channels, tone: wave }));

/** 10 s cut to three segments, faded at both ends and normalized to −1 dBFS. */
async function edited(t: OpenedTrack): Promise<AudioEdit> {
  let edit = cut(initialEdit(t.duration), { start: 6, end: 8 });
  edit = cut(edit, { start: 2, end: 3 });
  edit = fade(edit, { start: 0, end: 0.5 }, "in");
  const total = outputDuration(edit);
  edit = fade(edit, { start: total - 0.5, end: total }, "out");
  const peaks = await scanPeaks(t, { signal: signal() });
  const db = normalizeGain(peaks, edit, { start: 0, end: total }, -1);
  return gain(edit, { start: 0, end: total }, db);
}

/** Frames and absolute peak of a file, read back through the same path the editor uses. */
async function readBack(blob: Blob): Promise<{ t: OpenedTrack; frames: number; peak: number }> {
  const t = await open(bytesSource(new Uint8Array(await blob.arrayBuffer())));
  let frames = 0;
  let peak = 0;
  for await (const s of new AudioSampleSink(t.track).samples()) {
    const plane = new Float32Array(s.numberOfFrames);
    for (let c = 0; c < s.numberOfChannels; c++) {
      s.copyTo(plane, { planeIndex: c, format: "f32-planar" });
      for (const v of plane) peak = Math.max(peak, Math.abs(v));
    }
    frames += s.numberOfFrames;
    s.close();
  }
  return { t, frames, peak };
}

describe("exportAudio", () => {
  it("writes the three segments with fades and normalization as wav", async () => {
    const t = await openSynth(10);
    const edit = await edited(t);
    const blob = await exportAudio({ opened: t, edit, choice: WAV, signal: signal() });
    expect(blob.type).toBe("audio/wav");
    const back = await readBack(blob);
    expect(Math.abs(back.frames - 7 * RATE)).toBeLessThanOrEqual(1);
    expect(Math.abs(20 * Math.log10(back.peak) + 1)).toBeLessThanOrEqual(0.2);
  });

  it("writes the same edit as opus", async () => {
    const t = await openSynth(10);
    const edit = await edited(t);
    const choice: OutputChoice = { format: "opus", bitrate: 128000 };
    const blob = await exportAudio({ opened: t, edit, choice, signal: signal() });
    expect(blob.type).toBe("audio/ogg");
    const back = await readBack(blob);
    expect(Math.abs(back.t.duration - outputDuration(edit))).toBeLessThan(0.03);
  });

  it("writes the same edit as aac with the header patched in place", async (ctx) => {
    if (!(await canEncodeAudio("aac", { numberOfChannels: 1, sampleRate: RATE }))) ctx.skip();
    const t = await openSynth(10);
    const edit = await edited(t);
    const choice: OutputChoice = { format: "aac", bitrate: 192000 };
    const blob = await exportAudio({ opened: t, edit, choice, signal: signal() });
    expect(blob.type).toBe("audio/mp4");
    const back = await readBack(blob);
    // Chrome's macOS AAC encoder emits 2112 priming frames at timestamp 0 that mediabunny does
    // not trim, plus padding to the 1024-frame packet: the file runs up to ~90 ms long.
    const extra = back.t.duration - outputDuration(edit);
    expect(extra).toBeGreaterThan(-0.03);
    expect(extra).toBeLessThan(0.03 + (2112 + 2 * 1024) / RATE);
  });

  it("refuses before reading when the estimate is over the limit", async () => {
    const t = await openSynth(2);
    const samples = vi.spyOn(AudioSampleSink.prototype, "samples");
    const run = exportAudio({
      opened: t,
      edit: initialEdit(t.duration),
      choice: WAV,
      maxOutputBytes: 1000,
      signal: signal(),
    });
    await expect(run).rejects.toMatchObject({ code: "output_too_large" });
    expect(samples).not.toHaveBeenCalled();
  });

  it("stops with output_too_large when the sink overflows", async () => {
    const t = await openSynth(2);
    const edit = initialEdit(t.duration);
    const real = estimateBytes(WAV, 2 * RATE, 1, RATE);
    vi.mocked(estimateBytes).mockReturnValueOnce(0);
    const run = exportAudio({
      opened: t,
      edit,
      choice: WAV,
      maxOutputBytes: Math.floor(real / 2),
      signal: signal(),
    });
    await expect(run).rejects.toMatchObject({ code: "output_too_large" });
  });

  it("rejects on abort and reports no more progress", async () => {
    const t = await openSynth(10);
    const controller = new AbortController();
    const onProgress = vi.fn<(fraction: number) => void>(() => controller.abort());
    const run = exportAudio({
      opened: t,
      edit: initialEdit(t.duration),
      choice: WAV,
      signal: controller.signal,
      onProgress,
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(onProgress).toHaveBeenCalledTimes(1);
    const err = await run.catch((e: unknown) => e);
    expect(err).toBe(controller.signal.reason);
  });

  it("streams 20 minutes of 48 kHz stereo without holding it on the heap", async () => {
    const t = await openSynth(20 * 60, 2, () => 0.25);
    const before = memory();
    const blob = await exportAudio({
      opened: t,
      edit: initialEdit(t.duration),
      choice: WAV,
      signal: signal(),
    });
    const after = memory();
    expect(blob.size).toBeGreaterThan(20 * 60 * RATE * 4);
    // Without performance.memory (non-Chromium) the heap check is skipped.
    const grew = before === undefined || after === undefined ? 0 : after - before;
    expect(grew).toBeLessThan(100 * 1024 * 1024);
  }, 180_000);
});
