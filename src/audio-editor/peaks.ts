export type PeakLevel = { framesPerBin: number; min: Int16Array[]; max: Int16Array[] };
export type Peaks = {
  sampleRate: number;
  channels: 1 | 2;
  frames: number;
  levels: PeakLevel[];
};

export const BASE_FRAMES_PER_BIN = 256;
export const MAX_BINS = 2 ** 21;

const MAX_COARSE_BINS = 1024;

export function framesPerBinFor(totalFrames: number, maxBins = MAX_BINS): number {
  let framesPerBin = BASE_FRAMES_PER_BIN;
  while (Math.ceil(totalFrames / framesPerBin) > maxBins) framesPerBin *= 2;
  return framesPerBin;
}

export function buildLevels(base: PeakLevel): PeakLevel[] {
  const levels = [base];
  let last = base;
  while (last.min[0].length > MAX_COARSE_BINS) {
    const bins = Math.ceil(last.min[0].length / 4);
    const next: PeakLevel = {
      framesPerBin: last.framesPerBin * 4,
      min: last.min.map(() => new Int16Array(bins)),
      max: last.max.map(() => new Int16Array(bins)),
    };
    for (let c = 0; c < last.min.length; c++) {
      for (let j = 0; j < bins; j++) {
        let lo = 32767;
        let hi = -32768;
        const end = Math.min(last.min[c].length, j * 4 + 4);
        for (let k = j * 4; k < end; k++) {
          lo = Math.min(lo, last.min[c][k]);
          hi = Math.max(hi, last.max[c][k]);
        }
        next.min[c][j] = lo;
        next.max[c][j] = hi;
      }
    }
    levels.push(next);
    last = next;
  }
  return levels;
}

export class PeakBuilder {
  private readonly sampleRate: number;
  private readonly channels: 1 | 2;
  private readonly totalFrames: number;
  private readonly framesPerBin: number;
  private readonly min: Int16Array[];
  private readonly max: Int16Array[];
  private pos = 0;

  constructor(o: { sampleRate: number; channels: 1 | 2; totalFrames: number; maxBins?: number }) {
    this.sampleRate = o.sampleRate;
    this.channels = o.channels;
    this.totalFrames = o.totalFrames;
    this.framesPerBin = framesPerBinFor(o.totalFrames, o.maxBins);
    const bins = Math.ceil(o.totalFrames / this.framesPerBin);
    this.min = Array.from({ length: o.channels }, () => new Int16Array(bins).fill(32767));
    this.max = Array.from({ length: o.channels }, () => new Int16Array(bins).fill(-32768));
  }

  push(planes: Float32Array[], frames: number): void {
    const n = Math.min(frames, this.totalFrames - this.pos);
    for (let c = 0; c < this.channels; c++) {
      const plane = planes[c] ?? planes[0];
      const lo = this.min[c];
      const hi = this.max[c];
      for (let i = 0; i < n; i++) {
        const bin = Math.floor((this.pos + i) / this.framesPerBin);
        const v = plane[i] * 32767;
        const floor = Math.max(-32768, Math.floor(v));
        const ceil = Math.min(32767, Math.ceil(v));
        if (floor < lo[bin]) lo[bin] = floor;
        if (ceil > hi[bin]) hi[bin] = ceil;
      }
    }
    if (n > 0) this.pos += n;
  }

  progress(): number {
    return this.totalFrames === 0 ? 1 : Math.min(1, this.pos / this.totalFrames);
  }

  finish(): Peaks {
    const touched = Math.ceil(this.pos / this.framesPerBin);
    const min = this.min.map((a) => a.slice());
    const max = this.max.map((a) => a.slice());
    for (let c = 0; c < this.channels; c++) {
      min[c].fill(0, touched);
      max[c].fill(0, touched);
    }
    const base: PeakLevel = { framesPerBin: this.framesPerBin, min, max };
    return {
      sampleRate: this.sampleRate,
      channels: this.channels,
      frames: this.totalFrames,
      levels: buildLevels(base),
    };
  }
}

export function levelFor(peaks: Peaks, framesPerPixel: number): PeakLevel {
  let chosen = peaks.levels[0];
  for (const level of peaks.levels) {
    if (level.framesPerBin <= framesPerPixel) chosen = level;
  }
  return chosen;
}

export function peakIn(peaks: Peaks, startFrame: number, endFrame: number): number {
  const level = peaks.levels[0];
  const bins = level.min[0].length;
  const from = Math.max(0, Math.floor(startFrame / level.framesPerBin));
  const to = Math.min(bins, Math.ceil(endFrame / level.framesPerBin));
  let peak = 0;
  for (let c = 0; c < level.min.length; c++) {
    for (let j = from; j < to; j++) {
      peak = Math.max(peak, Math.abs(level.min[c][j]), Math.abs(level.max[c][j]));
    }
  }
  return peak / 32768;
}
