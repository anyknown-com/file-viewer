import { AudioSampleSink, type InputAudioTrack } from "mediabunny";
import { toMediaError } from "../media";
import type { Range } from "./edit";
import { downmixToStereo } from "./gain";

type Cached = { covers: Range; start: number; planes: Float32Array[] };

export type ZoomWindow = {
  /** Planes from `range.start` on (source time), or null when the cached window does not cover it. */
  get(range: Range): Float32Array[] | null;
  load(range: Range, signal: AbortSignal): Promise<void>;
};

function concat(chunks: Float32Array[][], frames: number): Float32Array[] {
  const channels = chunks[0]?.length ?? 0;
  const planes = Array.from({ length: channels }, () => new Float32Array(frames));
  let at = 0;
  for (const chunk of chunks) {
    for (let c = 0; c < channels; c++) planes[c].set(chunk[c], at);
    at += chunk[0].length;
  }
  return planes;
}

/** Decodes the source PCM of one zoomed-in range; only the latest window is kept. */
export function createZoomWindow(track: InputAudioTrack): ZoomWindow {
  let cached: Cached | null = null;
  return {
    get(range) {
      if (!cached || range.start < cached.covers.start || range.end > cached.covers.end) {
        return null;
      }
      const offset = Math.max(0, Math.round((range.start - cached.start) * track.sampleRate));
      return cached.planes.map((p) => p.subarray(offset));
    },
    async load(range, signal) {
      const chunks: Float32Array[][] = [];
      let start: number | null = null;
      let frames = 0;
      try {
        for await (const sample of new AudioSampleSink(track).samples(range.start, range.end)) {
          try {
            if (signal.aborted) throw signal.reason;
            start ??= sample.timestamp;
            const planes: Float32Array[] = [];
            for (let c = 0; c < sample.numberOfChannels; c++) {
              const plane = new Float32Array(sample.numberOfFrames);
              sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
              planes.push(plane);
            }
            chunks.push(downmixToStereo(planes));
            frames += sample.numberOfFrames;
          } finally {
            sample.close();
          }
        }
        if (signal.aborted) throw signal.reason;
      } catch (e) {
        if (signal.aborted) throw signal.reason;
        throw toMediaError(e, "decode_failed");
      }
      cached = { covers: range, start: start ?? range.start, planes: concat(chunks, frames) };
    },
  };
}
