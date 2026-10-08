import { describe, expect, it } from "vitest";
import { gain, initialEdit } from "./edit";
import { NORMALIZE_DEFAULT_DB, normalizeGain } from "./normalize";
import { PeakBuilder } from "./peaks";

const RATE = 48000;

function peaksOf(seconds: number, amp: number) {
  const frames = Math.round(seconds * RATE);
  const data = new Float32Array(frames);
  let truePeak = 0;
  for (let i = 0; i < frames; i++) {
    data[i] = amp * Math.sin((2 * Math.PI * 440 * i) / RATE);
    truePeak = Math.max(truePeak, Math.abs(data[i]));
  }
  const b = new PeakBuilder({ sampleRate: RATE, channels: 1, totalFrames: frames });
  b.push([data], frames);
  return { peaks: b.finish(), truePeak };
}

const db = (x: number) => 20 * Math.log10(x);

describe("normalizeGain", () => {
  it("never pushes the peak over the target", () => {
    for (const amp of [0.9, 0.3, 0.05, 0.001]) {
      const { peaks, truePeak } = peaksOf(1, amp);
      const g = normalizeGain(peaks, initialEdit(1), { start: 0, end: 1 }, NORMALIZE_DEFAULT_DB);
      expect(db(truePeak) + g).toBeLessThanOrEqual(NORMALIZE_DEFAULT_DB + 1e-9);
    }
  });

  it("lands within 0.05 dB of the target for sources above -40 dBFS", () => {
    for (const amp of [0.9, 0.3, 0.05, 0.01]) {
      const { peaks, truePeak } = peaksOf(1, amp);
      const g = normalizeGain(peaks, initialEdit(1), { start: 0, end: 1 }, -3);
      expect(Math.abs(db(truePeak) + g - -3)).toBeLessThan(0.05);
    }
  });

  it("returns 6 dB less when a +6 dB gain is already applied", () => {
    const { peaks } = peaksOf(1, 0.1);
    const range = { start: 0, end: 1 };
    const plain = normalizeGain(peaks, initialEdit(1), range, -1);
    const boosted = normalizeGain(peaks, gain(initialEdit(1), range, 6), range, -1);
    expect(plain - boosted).toBeCloseTo(6, 3);
  });

  it("returns 0 for silence", () => {
    const { peaks } = peaksOf(1, 0);
    expect(normalizeGain(peaks, initialEdit(1), { start: 0, end: 1 }, -1)).toBe(0);
  });
});
