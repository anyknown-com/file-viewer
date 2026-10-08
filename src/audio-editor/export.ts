import {
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  type OutputFormat,
  StreamTarget,
  WavOutputFormat,
} from "mediabunny";
import { ViewerError } from "../contract/errors";
import { createBlobSink, toMediaError } from "../media";
import { type AudioEdit, outputDuration } from "./edit";
import {
  estimateBytes,
  FORMATS,
  type FormatId,
  type OutputChoice,
  outputSampleRate,
} from "./formats";
import { applyGains, downmixToStereo } from "./gain";
import type { OpenedTrack } from "./open-track";

function container(format: FormatId): OutputFormat {
  if (format === "aac") return new Mp4OutputFormat({ fastStart: false });
  if (format === "opus") return new OggOutputFormat();
  return new WavOutputFormat();
}

/**
 * Encodes the edit segment by segment into a Blob. Samples stream from the source through the
 * gains into the encoder; only the sink keeps output bytes.
 */
export async function exportAudio(o: {
  opened: OpenedTrack;
  edit: AudioEdit;
  choice: OutputChoice;
  maxOutputBytes?: number;
  signal: AbortSignal;
  onProgress?: (fraction: number) => void;
}): Promise<Blob> {
  const { opened, edit, choice, signal } = o;
  const rate = opened.sampleRate;
  const channels = Math.min(opened.channels, 2) as 1 | 2;
  const totalFrames = Math.round(outputDuration(edit) * rate);
  if (
    o.maxOutputBytes !== undefined &&
    estimateBytes(choice, totalFrames, channels, rate) > o.maxOutputBytes
  ) {
    throw new ViewerError("output_too_large");
  }
  const format = FORMATS[choice.format];
  const sink = createBlobSink({ maxBytes: o.maxOutputBytes });
  const output = new Output({
    format: container(choice.format),
    target: new StreamTarget(sink.writable),
  });
  try {
    signal.throwIfAborted();
    const source = new AudioSampleSource({
      codec: format.codec,
      bitrate: choice.bitrate ?? undefined,
      transform: { sampleRate: outputSampleRate(choice.format, rate) },
    });
    output.addAudioTrack(source);
    await output.start();
    let written = 0;
    for (const seg of edit.segments) {
      // oxlint-disable-next-line no-await-in-loop -- segments are encoded in output order.
      for await (const sample of new AudioSampleSink(opened.track).samples(seg.in, seg.out)) {
        try {
          signal.throwIfAborted();
          written += await addSlice(source, sample, seg, written, rate, edit);
        } finally {
          sample.close();
        }
        signal.throwIfAborted();
        o.onProgress?.(totalFrames === 0 ? 1 : Math.min(1, written / totalFrames));
      }
    }
    await output.finalize();
    return sink.toBlob(format.mime);
  } catch (e) {
    await output.cancel().catch(() => undefined);
    if (signal.aborted) throw signal.reason;
    throw toMediaError(e, "decode_failed");
  }
}

/**
 * Adds the frames of `sample` that fall in `[seg.in, seg.out)` at output frame `written`,
 * mixed to at most two channels and with the gains applied. Returns the frames added.
 */
async function addSlice(
  source: AudioSampleSource,
  sample: AudioSample,
  seg: { in: number; out: number },
  written: number,
  rate: number,
  edit: AudioEdit,
): Promise<number> {
  const first = Math.max(0, Math.round((seg.in - sample.timestamp) * rate));
  const end = Math.min(sample.numberOfFrames, Math.round((seg.out - sample.timestamp) * rate));
  const frames = end - first;
  if (frames <= 0) return 0;
  const planes = Array.from({ length: sample.numberOfChannels }, (_, c) => {
    const plane = new Float32Array(frames);
    sample.copyTo(plane, {
      planeIndex: c,
      format: "f32-planar",
      frameOffset: first,
      frameCount: frames,
    });
    return plane;
  });
  const mixed = downmixToStereo(planes);
  const t0 = written / rate;
  applyGains(mixed, t0, rate, edit);
  const data = new Float32Array(frames * mixed.length);
  mixed.forEach((p, c) => data.set(p, c * frames));
  const out = new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: mixed.length,
    sampleRate: rate,
    timestamp: t0,
  });
  try {
    await source.add(out);
  } finally {
    out.close();
  }
  return frames;
}
