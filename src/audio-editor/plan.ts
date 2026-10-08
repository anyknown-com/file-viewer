import { type AudioEdit, type Range, boundaries, sourceAt } from "./edit";

export type Block = { outStart: number; srcStart: number; srcEnd: number };

const EPS = 1e-9;

/**
 * Blocks to schedule for output time `from` over `to - from` seconds. A new
 * block starts at every segment boundary. With `loop`, reaching `loop.end`
 * continues at `loop.start`; `outStart` keeps counting the scheduled length.
 */
export function plan(state: AudioEdit, from: number, to: number, loop: Range | null): Block[] {
  const bounds = boundaries(state);
  const total = bounds[bounds.length - 1];
  const loopEnd = loop ? Math.min(loop.end, total) : total;
  const looping = loop !== null && loopEnd - loop.start > EPS;
  const stop = looping ? loopEnd : total;
  const blocks: Block[] = [];
  let remaining = to - from;
  let out = from;
  let cursor = looping && from >= stop - EPS ? loop.start : from;
  while (remaining > EPS) {
    if (cursor >= stop - EPS) {
      if (!looping) break;
      cursor = loop.start;
    }
    const near = bounds.find((b) => Math.abs(b - cursor) <= EPS);
    if (near !== undefined) cursor = near;
    const next = bounds.find((b) => b > cursor + EPS) ?? total;
    const end = Math.min(next, stop, cursor + remaining);
    const hit = sourceAt(state, cursor);
    if (!hit || end - cursor <= EPS) break;
    const len = end - cursor;
    blocks.push({ outStart: out, srcStart: hit.source, srcEnd: hit.source + len });
    out += len;
    remaining -= len;
    cursor = end;
  }
  return blocks;
}
