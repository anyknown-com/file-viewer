import { type AudioEdit, type Gain } from "./edit";

const SEAM_SECONDS = 0.005;
const SQRT_HALF = 0.7071;

/** Output times where adjacent segments are not contiguous in the source. */
export function seamTimes(state: AudioEdit): number[] {
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < state.segments.length - 1; i++) {
    const s = state.segments[i];
    t += s.out - s.in;
    if (s.out !== state.segments[i + 1].in) times.push(t);
  }
  return times;
}

function gainOf(g: Gain, t: number): number {
  if (g.kind === "gain") return 10 ** ((g.db ?? 0) / 20);
  const x = (t - g.start) / (g.end - g.start);
  return g.kind === "fadeIn" ? Math.sin((Math.PI * x) / 2) : Math.cos((Math.PI * x) / 2);
}

function gainWith(state: AudioEdit, seams: number[], t: number): number {
  let result = 1;
  for (const g of state.gains) {
    if (t >= g.start && t <= g.end) result *= gainOf(g, t);
  }
  for (const b of seams) {
    if (t >= b - SEAM_SECONDS && t < b) {
      result *= Math.cos((Math.PI * (t - (b - SEAM_SECONDS))) / SEAM_SECONDS / 2);
    } else if (t >= b && t < b + SEAM_SECONDS) {
      result *= Math.sin((Math.PI * (t - b)) / SEAM_SECONDS / 2);
    }
  }
  return result;
}

export function gainAt(state: AudioEdit, t: number): number {
  return gainWith(state, seamTimes(state), t);
}

export function applyGains(
  planes: Float32Array[],
  t0: number,
  sampleRate: number,
  state: AudioEdit,
): void {
  const seams = seamTimes(state);
  if (state.gains.length === 0 && seams.length === 0) return;
  const frames = planes[0]?.length ?? 0;
  for (let i = 0; i < frames; i++) {
    const g = gainWith(state, seams, t0 + i / sampleRate);
    if (g === 1) continue;
    for (const plane of planes) plane[i] *= g;
  }
}

export function downmixToStereo(planes: Float32Array[]): Float32Array[] {
  if (planes.length <= 2) return planes;
  if (planes.length !== 4 && planes.length !== 6) return planes.slice(0, 2);
  const frames = planes[0].length;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    if (planes.length === 4) {
      left[i] = 0.5 * (planes[0][i] + planes[2][i]);
      right[i] = 0.5 * (planes[1][i] + planes[3][i]);
    } else {
      left[i] = planes[0][i] + SQRT_HALF * (planes[2][i] + planes[4][i]);
      right[i] = planes[1][i] + SQRT_HALF * (planes[2][i] + planes[5][i]);
    }
  }
  return [left, right];
}
