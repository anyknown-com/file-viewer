import {
  canEncodeVideo,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
} from "mediabunny";
import { describe, expect, it } from "vitest";
import { blobSource } from "../contract/byte-source";
import { createBlobSink } from "./blob-sink";
import { toMediaError } from "./media-error";
import { openMedia } from "./open-media";

const layout = { headBytes: 1024, sealBytes: 4096, keepBytes: 1024 };

async function encodeClip(fastStart: false | "fragmented", maxBytes?: number) {
  expect(await canEncodeVideo("vp9")).toBe(true);
  const sink = createBlobSink(maxBytes === undefined ? {} : { maxBytes }, layout);
  const canvas = new OffscreenCanvas(128, 128);
  const ctx = canvas.getContext("2d")!;
  const source = new CanvasSource(canvas, { codec: "vp9", quality: QUALITY_HIGH });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart }),
    target: new StreamTarget(sink.writable),
  });
  output.addVideoTrack(source);
  await output.start();
  for (let i = 0; i < 60; i++) {
    for (let y = 0; y < 128; y += 8) {
      for (let x = 0; x < 128; x += 8) {
        ctx.fillStyle = `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`;
        ctx.fillRect(x, y, 8, 8);
      }
    }
    await source.add(i / 30, 1 / 30);
  }
  await output.finalize();
  return sink;
}

async function readBack(sink: Awaited<ReturnType<typeof encodeClip>>) {
  const m = await openMedia(blobSource(sink.toBlob("video/mp4")), "video");
  const result = { hasVideo: m.video !== null, duration: m.duration, size: sink.size };
  m.dispose();
  return result;
}

describe("mp4 round trip", () => {
  it("fragmented", async () => {
    const r = await readBack(await encodeClip("fragmented"));
    expect(r.size).toBeGreaterThan(6144);
    expect(r.hasVideo).toBe(true);
    expect(Math.abs(r.duration - 2)).toBeLessThan(1 / 30);
  });

  it("non-fragmented (mdat header rewrite)", async () => {
    const r = await readBack(await encodeClip(false));
    expect(r.size).toBeGreaterThan(6144);
    expect(r.hasVideo).toBe(true);
    expect(Math.abs(r.duration - 2)).toBeLessThan(1 / 30);
  });

  it("stops at maxBytes", async () => {
    const err = await encodeClip("fragmented", 2048).catch((e: unknown) => e);
    expect(toMediaError(err, "decode_failed").code).toBe("output_too_large");
  });
});
