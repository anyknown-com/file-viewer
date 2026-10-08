import { type AudioSample, AudioSampleSink } from "mediabunny";
import { toMediaError } from "../media";
import { downmixToStereo } from "./gain";
import type { OpenedTrack } from "./open-track";
import { PeakBuilder, type Peaks } from "./peaks";

const PROGRESS_SECONDS = 0.25;

function pushSample(builder: PeakBuilder, buffers: Float32Array[], sample: AudioSample): number {
  const frames = sample.numberOfFrames;
  const planes: Float32Array[] = [];
  for (let c = 0; c < sample.numberOfChannels; c++) {
    if (!buffers[c] || buffers[c].length < frames) buffers[c] = new Float32Array(frames);
    sample.copyTo(buffers[c], { planeIndex: c, format: "f32-planar" });
    planes.push(buffers[c]);
  }
  builder.push(downmixToStereo(planes), frames);
  return frames;
}

export async function scanPeaks(
  t: OpenedTrack,
  o: { signal: AbortSignal; onProgress?: (builder: PeakBuilder) => void },
): Promise<Peaks> {
  const builder = new PeakBuilder({
    sampleRate: t.sampleRate,
    channels: t.channels === 1 ? 1 : 2,
    totalFrames: Math.round(t.duration * t.sampleRate),
  });
  const buffers: Float32Array[] = [];
  let sinceProgress = 0;
  try {
    for await (const sample of new AudioSampleSink(t.track).samples()) {
      try {
        if (o.signal.aborted) throw o.signal.reason;
        sinceProgress += pushSample(builder, buffers, sample);
      } finally {
        sample.close();
      }
      if (sinceProgress >= PROGRESS_SECONDS * t.sampleRate) {
        sinceProgress = 0;
        o.onProgress?.(builder);
      }
    }
    if (o.signal.aborted) throw o.signal.reason;
  } catch (e) {
    if (o.signal.aborted) throw o.signal.reason;
    throw toMediaError(e, "decode_failed");
  }
  return builder.finish();
}
