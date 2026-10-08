import { type AudioEdit, sourceAt } from "./edit";
import { gainAt, seamTimes } from "./gain";
import { levelFor, type Peaks } from "./peaks";

/** A window onto the output timeline: `start` seconds at x = 0, `width` CSS pixels. */
export type View = { start: number; secondsPerPixel: number; width: number };

export type Columns = { min: Float32Array; max: Float32Array; seams: number[] };

export function fitView(duration: number, width: number): View {
  return { start: 0, secondsPerPixel: width > 0 ? duration / width : 0, width };
}

export function timeAt(view: View, x: number): number {
  return view.start + x * view.secondsPerPixel;
}

export function xAt(view: View, t: number): number {
  return (t - view.start) / view.secondsPerPixel;
}

/** Keeps the view inside the timeline: at most the whole duration wide, never past either end. */
export function clampView(view: View, duration: number, minSecondsPerPixel = 0): View {
  const maxSpp = view.width > 0 ? duration / view.width : view.secondsPerPixel;
  const secondsPerPixel = Math.min(maxSpp, Math.max(minSecondsPerPixel, view.secondsPerPixel));
  const maxStart = Math.max(0, duration - view.width * secondsPerPixel);
  return { ...view, secondsPerPixel, start: Math.min(maxStart, Math.max(0, view.start)) };
}

/** `factor` multiplies seconds per pixel: below 1 zooms in. The time under `anchorX` stays put. */
export function zoom(
  view: View,
  factor: number,
  anchorX: number,
  duration: number,
  sampleRate: number,
): View {
  const anchor = timeAt(view, anchorX);
  const sized = clampView(
    { ...view, secondsPerPixel: view.secondsPerPixel * factor },
    duration,
    1 / sampleRate,
  );
  return clampView({ ...sized, start: anchor - anchorX * sized.secondsPerPixel }, duration);
}

export function scroll(view: View, dx: number, duration: number): View {
  return clampView({ ...view, start: view.start + dx * view.secondsPerPixel }, duration);
}

/** Min / max of the source between two source times, -1..1; written into `out`. */
type MinMax = (srcStart: number, srcEnd: number, out: [number, number]) => void;

function build(state: AudioEdit, view: View, minMax: MinMax): Columns {
  const width = Math.max(0, Math.floor(view.width));
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  const out: [number, number] = [0, 0];
  for (let x = 0; x < width; x++) {
    const t0 = timeAt(view, x);
    const t1 = timeAt(view, x + 1);
    const at = sourceAt(state, t0);
    if (!at) continue;
    const srcEnd = Math.min(at.segment.out, at.source + (t1 - t0));
    minMax(at.source, srcEnd, out);
    const g = gainAt(state, (t0 + t1) / 2);
    min[x] = out[0] * g;
    max[x] = out[1] * g;
  }
  const seams: number[] = [];
  for (const t of seamTimes(state)) {
    const x = xAt(view, t);
    if (x >= 0 && x <= width) seams.push(x);
  }
  return { min, max, seams };
}

/** Pixel columns of the output timeline from the peak table (both channels merged). */
export function columns(peaks: Peaks, state: AudioEdit, view: View): Columns {
  const level = levelFor(peaks, view.secondsPerPixel * peaks.sampleRate);
  const bins = level.min[0]?.length ?? 0;
  const perBin = level.framesPerBin / peaks.sampleRate;
  return build(state, view, (s0, s1, out) => {
    const from = Math.max(0, Math.floor(s0 / perBin));
    const to = Math.min(bins, Math.max(from + 1, Math.ceil(s1 / perBin)));
    let lo = 32767;
    let hi = -32768;
    for (let c = 0; c < level.min.length; c++) {
      for (let j = from; j < to; j++) {
        if (level.min[c][j] < lo) lo = level.min[c][j];
        if (level.max[c][j] > hi) hi = level.max[c][j];
      }
    }
    out[0] = from < to ? lo / 32767 : 0;
    out[1] = from < to ? hi / 32767 : 0;
  });
}

/** Pixel columns straight from decoded samples; `planes[0][0]` is source time `start`. */
export function sampleColumns(
  planes: Float32Array[],
  start: number,
  sampleRate: number,
  state: AudioEdit,
  view: View,
): Columns {
  const frames = planes[0]?.length ?? 0;
  return build(state, view, (s0, s1, out) => {
    const from = Math.max(0, Math.floor((s0 - start) * sampleRate));
    const to = Math.min(frames, Math.max(from + 1, Math.ceil((s1 - start) * sampleRate)));
    let lo = 1;
    let hi = -1;
    for (const plane of planes) {
      for (let i = from; i < to; i++) {
        if (plane[i] < lo) lo = plane[i];
        if (plane[i] > hi) hi = plane[i];
      }
    }
    out[0] = from < to ? lo : 0;
    out[1] = from < to ? hi : 0;
  });
}
