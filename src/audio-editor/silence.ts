import { type AudioEdit, type Range } from "./edit";
import { gainAt } from "./gain";
import { type Peaks } from "./peaks";

export const SILENCE_DEFAULTS = { thresholdDb: -50, minSeconds: 1 };
export const SILENCE_PAD = 0.2;

/** Walks the finest peak bins in output order; `amp` is the 0..1 peak of the bin. */
export function eachOutputBin(
  peaks: Peaks,
  state: AudioEdit,
  fn: (outStart: number, outEnd: number, amp: number) => void,
): void {
  const level = peaks.levels[0];
  const binSeconds = level.framesPerBin / peaks.sampleRate;
  const bins = level.min[0].length;
  let out = 0;
  for (const segment of state.segments) {
    const first = Math.max(0, Math.floor(segment.in / binSeconds));
    const last = Math.min(bins, Math.ceil(segment.out / binSeconds));
    for (let j = first; j < last; j++) {
      const from = Math.max(j * binSeconds, segment.in);
      const to = Math.min((j + 1) * binSeconds, segment.out);
      if (to <= from) continue;
      let peak = 0;
      for (let c = 0; c < level.min.length; c++) {
        peak = Math.max(peak, Math.abs(level.min[c][j]), Math.abs(level.max[c][j]));
      }
      fn(out + (from - segment.in), out + (to - segment.in), Math.min(1, peak / 32767));
    }
    out += segment.out - segment.in;
  }
}

export function findSilence(
  peaks: Peaks,
  state: AudioEdit,
  o: { thresholdDb: number; minSeconds: number },
): Range[] {
  const threshold = 10 ** (o.thresholdDb / 20);
  const found: Range[] = [];
  let run: Range | null = null;
  const close = () => {
    if (run && run.end - run.start >= o.minSeconds) {
      const start = run.start + SILENCE_PAD;
      const end = run.end - SILENCE_PAD;
      if (end > start) found.push({ start, end });
    }
    run = null;
  };
  eachOutputBin(peaks, state, (start, end, amp) => {
    if (amp * gainAt(state, (start + end) / 2) < threshold) {
      if (run) run.end = end;
      else run = { start, end };
    } else close();
  });
  close();
  return found;
}
