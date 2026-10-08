import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import { downmixToStereo } from "./gain";
import { openTrack } from "./open-track";
import { PeakBuilder } from "./peaks";
import { scanPeaks } from "./scan";
import { encodeOpusOgg } from "./testing/encode-opus";
import { synthWavSource } from "./testing/synth-wav";

const RATE = 48000;
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

async function scanWav(o: Parameters<typeof synthWavSource>[0]) {
  const t = await openTrack(synthWavSource(o), signal());
  try {
    return await scanPeaks(t, { signal: signal() });
  } finally {
    t.dispose();
  }
}

function expected(seconds: number, channels: number, tone: (t: number, ch: number) => number) {
  const frames = seconds * RATE;
  const planes = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) planes[c][i] = tone(i / RATE, c);
  }
  const mixed = downmixToStereo(planes);
  const b = new PeakBuilder({
    sampleRate: RATE,
    channels: mixed.length as 1 | 2,
    totalFrames: frames,
  });
  b.push(mixed, frames);
  return b.finish();
}

function maxDiff(a: Int16Array, b: Int16Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
}

describe("scanPeaks", () => {
  it("matches the formula for a stereo WAV", async () => {
    const tone = (t: number, ch: number) =>
      (ch === 0 ? 0.5 : 0.25) * Math.sin(2 * Math.PI * 440 * t);
    const peaks = await scanWav({ seconds: 3, sampleRate: RATE, channels: 2, tone });
    const want = expected(3, 2, tone);
    expect(peaks.channels).toBe(2);
    for (let c = 0; c < 2; c++) {
      expect(maxDiff(peaks.levels[0].min[c], want.levels[0].min[c])).toBeLessThanOrEqual(2);
      expect(maxDiff(peaks.levels[0].max[c], want.levels[0].max[c])).toBeLessThanOrEqual(2);
    }
  });

  it("mixes 6 channels down to stereo", async () => {
    const gains = [0.1, 0.2, 0.3, 0.9, 0.1, 0.05];
    const tone = (t: number, ch: number) => gains[ch] * Math.sin(2 * Math.PI * 440 * t);
    const peaks = await scanWav({ seconds: 2, sampleRate: RATE, channels: 6, tone });
    const want = expected(2, 6, tone);
    expect(peaks.channels).toBe(2);
    for (let c = 0; c < 2; c++) {
      expect(maxDiff(peaks.levels[0].max[c], want.levels[0].max[c])).toBeLessThanOrEqual(8);
    }
  });

  it("scans an Opus file", async () => {
    const bytes = await encodeOpusOgg({ seconds: 3, frequency: 440 });
    const t = await openTrack(bytesSource(bytes), signal());
    try {
      expect(Math.abs(t.duration - 3)).toBeLessThan(0.03);
      const peaks = await scanPeaks(t, { signal: signal() });
      expect(Math.max(...peaks.levels[0].max[0])).toBeGreaterThan(10000);
    } finally {
      t.dispose();
    }
  });

  it("throws unsupported for an unknown container", async () => {
    await expect(openTrack(bytesSource(new Uint8Array(64)), signal())).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("throws codec_unsupported when AudioDecoder rejects the config", async () => {
    const bytes = await encodeOpusOgg({ seconds: 1, frequency: 440 });
    vi.stubGlobal("AudioDecoder", { isConfigSupported: async () => ({ supported: false }) });
    await expect(openTrack(bytesSource(bytes), signal())).rejects.toMatchObject({
      code: "codec_unsupported",
    });
  });

  it("throws webcodecs_unavailable without AudioDecoder", async () => {
    const bytes = await encodeOpusOgg({ seconds: 1, frequency: 440 });
    vi.stubGlobal("AudioDecoder", undefined);
    await expect(openTrack(bytesSource(bytes), signal())).rejects.toMatchObject({
      code: "webcodecs_unavailable",
    });
  });

  it("rejects when aborted mid-scan", async () => {
    const controller = new AbortController();
    const tone = (t: number) => 0.5 * Math.sin(2 * Math.PI * 440 * t);
    const t = await openTrack(
      synthWavSource({ seconds: 120, sampleRate: RATE, channels: 2, tone }),
      controller.signal,
    );
    try {
      await expect(
        scanPeaks(t, { signal: controller.signal, onProgress: () => controller.abort() }),
      ).rejects.toBeDefined();
    } finally {
      t.dispose();
    }
  });

  it("keeps memory flat on a 30-minute stereo WAV", async () => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const heap = () => perf.memory?.usedJSHeapSize ?? 0;
    const before = heap();
    const tone = (t: number) => 0.5 * Math.sin(2 * Math.PI * 440 * t);
    const peaks = await scanWav({ seconds: 1800, sampleRate: RATE, channels: 2, tone });
    expect(peaks.frames).toBe(1800 * RATE);
    expect(heap() - before).toBeLessThan(100 * 1024 * 1024);
  }, 300_000);
});
