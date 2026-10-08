import { describe, expect, it } from "vitest";
import { fade, initialEdit } from "./edit";
import { PeakBuilder } from "./peaks";
import { SILENCE_DEFAULTS, findSilence } from "./silence";

const RATE = 48000;

function peaksOf(seconds: number, sample: (t: number) => number) {
  const frames = Math.round(seconds * RATE);
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i++) data[i] = sample(i / RATE);
  const b = new PeakBuilder({ sampleRate: RATE, channels: 1, totalFrames: frames });
  b.push([data], frames);
  return b.finish();
}

const tone = (t: number) => 0.5 * Math.sin(2 * Math.PI * 440 * t);

describe("findSilence", () => {
  it("finds one range with 0.2 s kept on each side", () => {
    const p = peaksOf(4, (t) => (t < 1 || t >= 3 ? tone(t) : 0));
    const r = findSilence(p, initialEdit(4), SILENCE_DEFAULTS);
    expect(r).toHaveLength(1);
    expect(r[0].start).toBeCloseTo(1.2, 1);
    expect(r[0].end).toBeCloseTo(2.8, 1);
    expect(Math.abs(r[0].start - 1.2)).toBeLessThan(0.02);
    expect(Math.abs(r[0].end - 2.8)).toBeLessThan(0.02);
  });

  it("treats a -60 dBFS noise floor as silence", () => {
    const p = peaksOf(4, (t) => (t < 1 || t >= 3 ? tone(t) : 0.0008 * Math.sin(t * 5000)));
    expect(findSilence(p, initialEdit(4), SILENCE_DEFAULTS)).toHaveLength(1);
  });

  it("ignores gaps shorter than minSeconds", () => {
    const p = peaksOf(3, (t) => (t < 1 || t >= 1.8 ? tone(t) : 0));
    expect(findSilence(p, initialEdit(3), SILENCE_DEFAULTS)).toEqual([]);
  });

  it("counts a tail faded to zero as silence", () => {
    const p = peaksOf(10, tone);
    const o = { thresholdDb: -20, minSeconds: 1 };
    expect(findSilence(p, initialEdit(10), o)).toEqual([]);
    const r = findSilence(p, fade(initialEdit(10), { start: 0, end: 10 }, "out"), o);
    expect(r).toHaveLength(1);
    expect(r[0].start).toBeGreaterThan(8.8);
    expect(r[0].start).toBeLessThan(9.1);
    expect(r[0].end).toBeCloseTo(9.8, 1);
  });
});
