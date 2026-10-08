import { AudioSample, AudioSampleSource, BufferTarget, OggOutputFormat, Output } from "mediabunny";

/** 48 kHz mono sine as an Ogg Opus file. Browser tests only. */
export async function encodeOpusOgg(o: {
  seconds: number;
  frequency: number;
}): Promise<Uint8Array<ArrayBuffer>> {
  const rate = 48000;
  const target = new BufferTarget();
  const output = new Output({ format: new OggOutputFormat(), target });
  const source = new AudioSampleSource({ codec: "opus", bitrate: 128000 });
  output.addAudioTrack(source);
  await output.start();
  for (let start = 0; start < o.seconds; start += 1) {
    const frames = Math.round(Math.min(1, o.seconds - start) * rate);
    const data = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      data[i] = 0.5 * Math.sin((2 * Math.PI * o.frequency * (start * rate + i)) / rate);
    }
    const sample = new AudioSample({
      data,
      format: "f32-planar",
      numberOfChannels: 1,
      sampleRate: rate,
      timestamp: start,
    });
    await source.add(sample);
    sample.close();
  }
  await output.finalize();
  return new Uint8Array(target.buffer!);
}
