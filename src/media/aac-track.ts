import { EncodedAudioPacketSource, EncodedPacket, type Output } from "mediabunny";
import { keepFirstError } from "./keep-first-error";
import { toMediaError } from "./media-error";
import { linearResampler } from "./resample";

/**
 * Frames Chromium's AAC encoder puts before the first input frame. mediabunny 1.61.1's
 * `AudioSampleSource` keeps them, so a file would start with ~44 ms of silence.
 */
export const AAC_PRIMING_FRAMES = 2112;

/** An AAC track whose packets are shifted back by the encoder priming and cut at the last input frame. */
export type AacTrack = {
  /** Encodes planar frames (one array per channel, at `inputRate`) right after the previous ones. */
  add(planes: Float32Array[]): Promise<void>;
  /** Flushes the encoder and writes the last packets. Call before `output.finalize()`. */
  finish(): Promise<void>;
  /** Closes the encoder; safe after an error or a cancel. */
  close(): void;
};

const ignore = () => undefined;

type Queued = { packet: EncodedPacket; meta: EncodedAudioChunkMetadata | undefined };

/**
 * Adds an AAC track to `output` (before `output.start()`) and encodes it with WebCodecs directly,
 * so the priming can be moved before zero: mediabunny writes the negative start as an edit list.
 * Errors come out of `add` / `finish` as `ViewerError`, the first one winning.
 */
export function addAacTrack(
  output: Output,
  o: { inputRate: number; sampleRate: number; numberOfChannels: number; bitrate: number },
): AacTrack {
  const { sampleRate, numberOfChannels } = o;
  const source = new EncodedAudioPacketSource("aac");
  output.addAudioTrack(source);
  const packets = keepFirstError(
    new WritableStream<Queued>({ write: (q) => source.add(q.packet, q.meta) }),
  );
  const writer = packets.writable.getWriter();
  const fail = (e: unknown) => toMediaError(packets.error() ?? e, "decode_failed");
  // The last packets wait here until the end of the input is known.
  const held: Queued[] = [];
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const p = EncodedPacket.fromEncodedChunk(chunk);
      const ts = p.timestamp - AAC_PRIMING_FRAMES / sampleRate;
      held.push({ packet: new EncodedPacket(p.data, p.type, ts, p.duration), meta });
      while (held.length > 2) writer.write(held.shift()!).catch(ignore);
    },
    error: (e) => void writer.abort(e).catch(ignore),
  });
  encoder.configure({ codec: "mp4a.40.2", sampleRate, numberOfChannels, bitrate: o.bitrate });
  const resampler =
    o.inputRate === sampleRate ? null : linearResampler(o.inputRate, sampleRate, numberOfChannels);
  let frames = 0;

  const encode = (planes: Float32Array[]) => {
    const n = planes[0]?.length ?? 0;
    if (n === 0) return;
    const data = new Float32Array(n * numberOfChannels);
    planes.forEach((p, c) => data.set(p, c * n));
    const timestamp = Math.round((frames / sampleRate) * 1e6);
    const audio = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: n,
      numberOfChannels,
      timestamp,
      data,
    });
    frames += n;
    try {
      encoder.encode(audio);
    } finally {
      audio.close();
    }
  };

  return {
    async add(planes) {
      try {
        encode(resampler ? resampler.push(planes) : planes);
        await writer.ready;
        while (encoder.encodeQueueSize > 2) {
          // oxlint-disable-next-line no-await-in-loop -- waits for the encoder to drain.
          await new Promise((r) => encoder.addEventListener("dequeue", r, { once: true }));
        }
      } catch (e) {
        throw fail(e);
      }
    },
    async finish() {
      try {
        if (resampler) encode(resampler.finish());
        await encoder.flush();
        const end = frames / sampleRate;
        const kept = held.filter((q) => q.packet.timestamp < end);
        const lastOne = kept.pop();
        for (const q of kept) writer.write(q).catch(ignore);
        if (lastOne) {
          const p = lastOne.packet;
          const cut = new EncodedPacket(p.data, p.type, p.timestamp, end - p.timestamp);
          writer.write({ packet: cut, meta: lastOne.meta }).catch(ignore);
        }
        await writer.close();
      } catch (e) {
        throw fail(e);
      }
    },
    close() {
      if (encoder.state !== "closed") encoder.close();
    },
  };
}
