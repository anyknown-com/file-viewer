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
import { type AacTrack, addAacTrack, createBlobSink, keepFirstError, toMediaError } from "../media";
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
  const stream = keepFirstError(sink.writable);
  const output = new Output({
    format: container(choice.format),
    target: new StreamTarget(stream.writable),
  });
  let aac: AacTrack | null = null;
  try {
    signal.throwIfAborted();
    let add: AddPlanes;
    if (choice.format === "aac") {
      // AAC is encoded by our own encoder so its priming is trimmed (see addAacTrack).
      const track = addAacTrack(output, {
        inputRate: rate,
        sampleRate: outputSampleRate("aac", rate),
        numberOfChannels: channels,
        bitrate: choice.bitrate ?? format.defaultBitrate!,
      });
      aac = track;
      add = (planes) => track.add(planes);
    } else {
      const source = new AudioSampleSource({
        codec: format.codec,
        bitrate: choice.bitrate ?? undefined,
        transform: { sampleRate: outputSampleRate(choice.format, rate) },
      });
      output.addAudioTrack(source);
      add = (planes, t0) => addPlanes(source, planes, t0, rate);
    }
    await output.start();
    let written = 0;
    for (const seg of edit.segments) {
      // oxlint-disable-next-line no-await-in-loop -- segments are encoded in output order.
      for await (const sample of new AudioSampleSink(opened.track).samples(seg.in, seg.out)) {
        try {
          signal.throwIfAborted();
          written += await addSlice(add, sample, seg, written, rate, edit);
        } finally {
          sample.close();
        }
        signal.throwIfAborted();
        o.onProgress?.(totalFrames === 0 ? 1 : Math.min(1, written / totalFrames));
      }
    }
    await aac?.finish();
    await output.finalize();
    return sink.toBlob(format.mime);
  } catch (e) {
    await output.cancel().catch(() => undefined);
    if (signal.aborted) throw signal.reason;
    throw toMediaError(stream.error() ?? e, "decode_failed");
  } finally {
    aac?.close();
  }
}

/** Takes mixed planar frames that start at output time `t0` (seconds). */
type AddPlanes = (planes: Float32Array[], t0: number) => Promise<void>;

/**
 * Adds the frames of `sample` that fall in `[seg.in, seg.out)` at output frame `written`,
 * mixed to at most two channels and with the gains applied. Returns the frames added.
 */
async function addSlice(
  add: AddPlanes,
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
  await add(mixed, t0);
  return frames;
}

async function addPlanes(
  source: AudioSampleSource,
  planes: Float32Array[],
  t0: number,
  rate: number,
): Promise<void> {
  const frames = planes[0]!.length;
  const data = new Float32Array(frames * planes.length);
  planes.forEach((p, c) => data.set(p, c * frames));
  const out = new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: planes.length,
    sampleRate: rate,
    timestamp: t0,
  });
  try {
    await source.add(out);
  } finally {
    out.close();
  }
}
