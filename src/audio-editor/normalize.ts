import { type AudioEdit, type Range } from "./edit";
import { gainAt } from "./gain";
import { type Peaks } from "./peaks";
import { eachOutputBin } from "./silence";

export const NORMALIZE_DEFAULT_DB = -1;

export function normalizeGain(
  peaks: Peaks,
  state: AudioEdit,
  range: Range,
  targetDb: number,
): number {
  let p = 0;
  eachOutputBin(peaks, state, (start, end, amp) => {
    if (end <= range.start || start >= range.end) return;
    const g = Math.max(gainAt(state, start), gainAt(state, (start + end) / 2), gainAt(state, end));
    p = Math.max(p, amp * g);
  });
  return p === 0 ? 0 : targetDb - 20 * Math.log10(p);
}
