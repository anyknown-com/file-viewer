/**
 * Adapted from opencut-classic apps/web/src/services/renderer/scene-exporter.ts
 * @cf5e79e919144200294fb9fed22a222592a0aeea, MIT, Copyright 2025-2026 OpenCut
 */
import { AudioBufferSource, CanvasSource, Mp4OutputFormat, Output, StreamTarget } from "mediabunny";
import { isAbortError } from "../../contract/errors";
import {
  type AacTrack,
  addAacTrack,
  createBlobSink,
  keepFirstError,
  toMediaError,
} from "../../media";
import type { AssetStore } from "../engine/assets";
import { audioSegments } from "../engine/audio-plan";
import { FrameCache } from "../engine/frame-cache";
import { ensureFonts, type FrameSources, renderFrame } from "../engine/render-frame";
import { type Project, projectDuration } from "../model/project";
import { frameTicks, TICKS_PER_SECOND } from "../model/time";
import { MIX_SAMPLE_RATE, mixAudio } from "./audio-mix";
import type { ExportPreset } from "./settings";

export type ExportProgress = { done: number /* 0–1 */; etaSeconds: number | null };

/** True when some clip on the timeline would make sound. */
function hasAudio(p: Project, assets: AssetStore, duration: number): boolean {
  const withAudio = new Set<string>();
  for (const clip of p.tracks.main.clips) {
    const status = assets.status(clip.assetId);
    if (status.state === "ready" && status.info.hasAudio) withAudio.add(clip.assetId);
  }
  return audioSegments(p, withAudio, 0, duration).length > 0;
}

/** Renders the project frame by frame into a fragmented MP4; audio is mixed and added one second at a time. */
export async function runExport(o: {
  project: Project;
  assets: AssetStore;
  preset: ExportPreset;
  audioCodec: "aac" | "opus";
  maxOutputBytes: number;
  signal: AbortSignal;
  onProgress(p: ExportProgress): void;
}): Promise<Blob> {
  const { project: p, assets, preset } = o;
  const canvas = new OffscreenCanvas(preset.width, preset.height);
  const ctx = canvas.getContext("2d")!;
  const frames = new FrameCache(assets);
  const sources: FrameSources = {
    frame: async (id, seconds) => (await frames.frameAt(id, seconds))?.canvas ?? null,
    image: (id) => assets.image(id),
  };

  const sink = createBlobSink({ maxBytes: o.maxOutputBytes });
  const stream = keepFirstError(sink.writable);
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "fragmented" }),
    target: new StreamTarget(stream.writable),
  });
  const videoSource = new CanvasSource(canvas, { codec: "avc", bitrate: preset.videoBitrate });
  output.addVideoTrack(videoSource, { frameRate: preset.fps });
  const duration = projectDuration(p);
  let addAudio: ((buffer: AudioBuffer) => Promise<void>) | null = null;
  let aac: AacTrack | null = null;
  if (hasAudio(p, assets, duration)) {
    if (o.audioCodec === "aac") {
      // AAC is encoded by our own encoder so its priming is trimmed (see addAacTrack).
      const track = addAacTrack(output, {
        inputRate: MIX_SAMPLE_RATE,
        sampleRate: MIX_SAMPLE_RATE,
        numberOfChannels: 2,
        bitrate: 128_000,
      });
      aac = track;
      addAudio = (b) => track.add([b.getChannelData(0), b.getChannelData(1)]);
    } else {
      const source = new AudioBufferSource({ codec: o.audioCodec, bitrate: 128_000 });
      output.addAudioTrack(source);
      addAudio = (b) => source.add(b);
    }
  }

  const step = frameTicks(preset.fps);
  const total = Math.ceil(duration / step);
  const began = performance.now();
  try {
    await ensureFonts();
    await output.start();
    let second = -1;
    for (let n = 0; n < total; n++) {
      if (o.signal.aborted) throw new DOMException("aborted", "AbortError");
      const t = n * step;
      const s = Math.floor(t / TICKS_PER_SECOND);
      if (s !== second) {
        second = s;
        const from = s * TICKS_PER_SECOND;
        const to = Math.min(from + TICKS_PER_SECOND, duration);
        // oxlint-disable-next-line no-await-in-loop -- each second's audio is mixed and added in order.
        if (addAudio) await addAudio(await mixAudio(p, assets, from, to));
      }
      // oxlint-disable-next-line no-await-in-loop -- frames are drawn and encoded in output order.
      await renderFrame(ctx, p, t, sources);
      // oxlint-disable-next-line no-await-in-loop -- the encoder takes frames in output order.
      await videoSource.add(n / preset.fps, 1 / preset.fps);
      const done = (n + 1) / total;
      const elapsed = (performance.now() - began) / 1000;
      o.onProgress({ done, etaSeconds: (elapsed / done) * (1 - done) });
    }
    await aac?.finish();
    await output.finalize();
  } catch (e) {
    // Closing a stream that has already errored throws; the first error is the one to report.
    await output.cancel().catch(() => undefined);
    aac?.close();
    frames.dispose();
    if (isAbortError(e)) throw new DOMException("aborted", "AbortError");
    throw toMediaError(stream.error() ?? e, "decode_failed");
  }
  aac?.close();
  frames.dispose();
  return sink.toBlob("video/mp4");
}
