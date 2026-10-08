/**
 * Streams planar audio from one sample rate to another with linear interpolation (what
 * mediabunny's `AudioSampleSource` does for `transform.sampleRate`). Output frame `j` sits at
 * source position `j * from / to`.
 */
export function linearResampler(from: number, to: number, channels: number) {
  let inFrames = 0;
  let outFrames = 0;
  const last = Array.from({ length: channels }, () => 0);

  const emit = (stop: number, at: (c: number, k: number) => number): Float32Array[] => {
    const count = Math.max(0, stop - outFrames);
    const out = Array.from({ length: channels }, () => new Float32Array(count));
    for (let n = 0; n < count; n++) {
      const pos = ((outFrames + n) * from) / to;
      const i = Math.floor(pos);
      const f = pos - i;
      for (let c = 0; c < channels; c++) {
        const a = at(c, i);
        out[c]![n] = a + f * (at(c, i + 1) - a);
      }
    }
    outFrames += count;
    return out;
  };

  return {
    /** Takes the next input frames; returns the output frames they complete. */
    push(planes: Float32Array[]): Float32Array[] {
      const base = inFrames;
      const n = planes[0]!.length;
      if (n === 0) return emit(outFrames, () => 0);
      inFrames += n;
      // Frame j needs source frames floor(pos) and floor(pos) + 1; keep the rest for later.
      const out = emit(Math.ceil(((inFrames - 1) * to) / from), (c, k) =>
        k < base ? last[c]! : k < inFrames ? planes[c]![k - base]! : planes[c]![n - 1]!,
      );
      for (let c = 0; c < channels; c++) last[c] = planes[c]![n - 1]!;
      return out;
    },
    /** Returns the frames still owed, holding the last input frame to the end. */
    finish(): Float32Array[] {
      return emit(Math.round((inFrames * to) / from), (c) => last[c]!);
    },
  };
}
