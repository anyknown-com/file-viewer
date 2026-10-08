import { describe, expect, it } from "vitest";
import { BASE_FRAMES_PER_BIN, PeakBuilder, framesPerBinFor, levelFor, peakIn } from "./peaks";

const RATE = 48000;

function sine(frames: number, amp: number, offset = 0): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++)
    out[i] = amp * Math.sin((2 * Math.PI * 440 * (i + offset)) / RATE);
  return out;
}

function build(planes: Float32Array[], chunks: number[], maxBins?: number) {
  const total = planes[0].length;
  const b = new PeakBuilder({
    sampleRate: RATE,
    channels: planes.length as 1 | 2,
    totalFrames: total,
    maxBins,
  });
  let at = 0;
  for (const n of chunks) {
    b.push(
      planes.map((p) => p.subarray(at, at + n)),
      n,
    );
    at += n;
  }
  return b.finish();
}

describe("PeakBuilder", () => {
  it("records a 0.5 sine as about +-16384", () => {
    const p = build([sine(RATE, 0.5)], [RATE]);
    const base = p.levels[0];
    expect(Math.max(...base.max[0])).toBeGreaterThanOrEqual(16380);
    expect(Math.max(...base.max[0])).toBeLessThanOrEqual(16385);
    expect(Math.min(...base.min[0])).toBeLessThanOrEqual(-16380);
    expect(Math.min(...base.min[0])).toBeGreaterThanOrEqual(-16385);
  });

  it("rounds outward", () => {
    const pos = new Float32Array(256).fill(0.10001);
    const p = build([pos], [256]);
    expect(p.levels[0].max[0][0]).toBeGreaterThanOrEqual(3278);
    expect(p.levels[0].min[0][0]).toBeLessThanOrEqual(3277);
    const neg = new Float32Array(256).fill(-0.10001);
    expect(build([neg], [256]).levels[0].min[0][0]).toBeLessThanOrEqual(-3278);
  });

  it("clamps to int16", () => {
    const loud = new Float32Array(256).fill(2);
    const p = build([loud], [256]);
    expect(p.levels[0].max[0][0]).toBe(32767);
  });

  it("doubles framesPerBin until bins fit maxBins", () => {
    expect(framesPerBinFor(256 * 8, 8)).toBe(BASE_FRAMES_PER_BIN);
    expect(framesPerBinFor(256 * 8 + 1, 8)).toBe(512);
    expect(framesPerBinFor(256 * 30, 8)).toBe(1024);
    const p = build([sine(256 * 30, 0.5)], [256 * 30], 8);
    expect(p.levels[0].framesPerBin).toBe(1024);
    expect(p.levels[0].min[0].length).toBeLessThanOrEqual(8);
  });

  it("builds coarse levels equal to computing from the coarse bins directly", () => {
    const frames = 256 * 4096;
    const data = sine(frames, 0.7);
    const p = build([data], [frames]);
    expect(p.levels).toHaveLength(2);
    const coarse = p.levels[1];
    expect(coarse.framesPerBin).toBe(1024);
    for (const j of [0, 1, 500, 1023]) {
      let lo = 32767;
      let hi = -32768;
      for (let i = j * 1024; i < (j + 1) * 1024; i++) {
        lo = Math.min(lo, Math.floor(data[i] * 32767));
        hi = Math.max(hi, Math.ceil(data[i] * 32767));
      }
      expect(coarse.min[0][j]).toBe(lo);
      expect(coarse.max[0][j]).toBe(hi);
    }
  });

  it("gives the same result in 7 pushes as in 1", () => {
    const frames = 10000;
    const planes = [sine(frames, 0.6), sine(frames, 0.3, 17)];
    const once = build(planes, [frames]);
    const seven = build(planes, [1, 999, 1500, 2000, 3000, 1500, 1000]);
    expect(seven).toEqual(once);
  });

  it("reports progress", () => {
    const b = new PeakBuilder({ sampleRate: RATE, channels: 1, totalFrames: 1000 });
    expect(b.progress()).toBe(0);
    b.push([new Float32Array(500)], 500);
    expect(b.progress()).toBe(0.5);
  });
});

describe("levelFor / peakIn", () => {
  const frames = 256 * 4096;
  const p = build([sine(frames, 0.5)], [frames]);

  it("picks the coarsest level not coarser than the pixel", () => {
    expect(levelFor(p, 10)).toBe(p.levels[0]);
    expect(levelFor(p, 256)).toBe(p.levels[0]);
    expect(levelFor(p, 1023)).toBe(p.levels[0]);
    expect(levelFor(p, 1024)).toBe(p.levels[1]);
    expect(levelFor(p, 99999)).toBe(p.levels[1]);
  });

  it("returns the max abs peak over a range", () => {
    expect(peakIn(p, 0, frames)).toBeCloseTo(0.5, 2);
    expect(peakIn(p, 256, 256)).toBe(0);
    const silent = build([new Float32Array(1024)], [1024]);
    expect(peakIn(silent, 0, 1024)).toBe(0);
  });
});
