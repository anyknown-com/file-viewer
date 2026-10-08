// @vitest-environment node
import { AudioSample, AudioSampleSource, Output, StreamTarget, WavOutputFormat } from "mediabunny";
import { expect, it } from "vitest";
import { blobSource } from "../contract/byte-source";
import { createBlobSink } from "./blob-sink";
import { openMedia } from "./open-media";

it("round-trips wav through the blob sink", async () => {
  const sink = createBlobSink({}, { headBytes: 64, sealBytes: 256, keepBytes: 64 });
  const output = new Output({
    format: new WavOutputFormat(),
    target: new StreamTarget(sink.writable),
  });
  const src = new AudioSampleSource({ codec: "pcm-s16" });
  output.addAudioTrack(src);
  await output.start();
  for (let i = 0; i < 8; i++) {
    const data = new Float32Array(1000);
    for (let j = 0; j < data.length; j++)
      data[j] = Math.sin((2 * Math.PI * 440 * (i * 1000 + j)) / 8000);
    await src.add(
      new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: 1,
        sampleRate: 8000,
        timestamp: i * 0.125,
      }),
    );
  }
  await output.finalize();
  expect(sink.size).toBeGreaterThan(64 + 256 + 64);
  const blob = sink.toBlob("audio/wav");
  expect(new TextDecoder().decode(await blob.slice(0, 4).arrayBuffer())).toBe("RIFF");
  const m = await openMedia(blobSource(blob), "audio");
  expect(Math.abs(m.duration - 1)).toBeLessThan(1 / 8000);
  m.dispose();
});
