import {
  ALL_FORMATS,
  AudioSampleSink,
  BufferSource,
  BufferTarget,
  canEncodeAudio,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { describe, expect, it } from "vitest";
import { addAacTrack } from "./aac-track";

const FRAME = 1024; // frames per AAC packet

/** A 440 Hz cosine at full swing from the very first frame, `seconds` long at `rate`. */
function tone(seconds: number, rate: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.cos((2 * Math.PI * 440 * i) / rate);
  return out;
}

async function encode(
  signal: Float32Array,
  o: { inputRate: number; sampleRate: number; fragmented: boolean },
): Promise<ArrayBuffer> {
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: o.fragmented ? "fragmented" : false }),
    target,
  });
  const track = addAacTrack(output, { ...o, numberOfChannels: 1, bitrate: 128_000 });
  try {
    await output.start();
    const step = Math.round(o.inputRate / 10);
    for (let at = 0; at < signal.length; at += step) {
      // oxlint-disable-next-line no-await-in-loop -- frames go to the encoder in order.
      await track.add([signal.subarray(at, at + step)]);
    }
    await track.finish();
    await output.finalize();
  } finally {
    track.close();
  }
  return target.buffer!;
}

/** Where the first audible frame plays (seconds) and how long the file lasts. */
async function measure(bytes: ArrayBuffer): Promise<{ onset: number; duration: number }> {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  try {
    const audio = (await input.getPrimaryAudioTrack())!;
    let onset = Number.NaN;
    for await (const s of new AudioSampleSink(audio).samples()) {
      const plane = new Float32Array(s.numberOfFrames);
      s.copyTo(plane, { planeIndex: 0, format: "f32-planar" });
      const i = plane.findIndex((v) => Math.abs(v) > 0.01);
      if (Number.isNaN(onset) && i >= 0) onset = s.timestamp + i / s.sampleRate;
      s.close();
    }
    return { onset, duration: await audio.computeDuration() };
  } finally {
    input.dispose();
  }
}

describe("addAacTrack", () => {
  it.for([
    { name: "48 kHz", inputRate: 48000, sampleRate: 48000, fragmented: false },
    { name: "48 kHz fragmented", inputRate: 48000, sampleRate: 48000, fragmented: true },
    { name: "44.1 kHz", inputRate: 44100, sampleRate: 44100, fragmented: false },
    {
      name: "22.05 kHz resampled to 48 kHz",
      inputRate: 22050,
      sampleRate: 48000,
      fragmented: false,
    },
  ])("starts on time and ends on the last frame ($name)", async (o, ctx) => {
    const ok = await canEncodeAudio("aac", { numberOfChannels: 1, sampleRate: o.sampleRate });
    if (!ok) ctx.skip();
    const seconds = 1.3;
    const { onset, duration } = await measure(await encode(tone(seconds, o.inputRate), o));
    // If this fails on some Chromium, its encoder priming is not AAC_PRIMING_FRAMES: derive it
    // from the encoder output instead.
    expect(Math.abs(onset)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(duration - seconds)).toBeLessThanOrEqual(FRAME / o.sampleRate);
  });
});
