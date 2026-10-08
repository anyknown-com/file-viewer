import { afterEach, expect, it } from "vitest";
import type { PngImage } from "../../comp/index";
import { createWorkerRunner, type WorkerRunner } from "./run-in-worker";

let runner: WorkerRunner | null = null;
afterEach(() => runner?.terminate());

function image(channels: 1 | 4): PngImage {
  const width = 3;
  const height = 2;
  const data = new Uint8Array(width * height * channels).map((_, i) => (i * 37) % 256);
  return { width, height, channels, data };
}

it("round-trips an RGBA layer through encodePng and decodePng", async () => {
  runner = createWorkerRunner();
  const src = image(4);
  const bytes = await runner.run({ kind: "encodePng", input: { ...src, data: src.data.slice() } });
  expect(bytes).toBeInstanceOf(Uint8Array);
  const out = await runner.run({ kind: "decodePng", input: { bytes, kind: "layer" } }, [
    bytes.buffer,
  ]);
  expect(out).toEqual(src);
});

it("decodes a one-channel mask", async () => {
  runner = createWorkerRunner();
  const src = image(1);
  const bytes = await runner.run({ kind: "encodePng", input: src });
  const out = await runner.run({ kind: "decodePng", input: { bytes, kind: "mask" } });
  expect(out.channels).toBe(1);
  expect(out.data).toEqual(src.data);
});

it("rejects with AbortError when the signal aborts", async () => {
  runner = createWorkerRunner();
  const controller = new AbortController();
  const job = runner.run({ kind: "encodePng", input: image(4) }, [], controller.signal);
  controller.abort();
  await expect(job).rejects.toMatchObject({ name: "AbortError" });
  const before = new AbortController();
  before.abort();
  await expect(
    runner.run({ kind: "encodePng", input: image(4) }, [], before.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
});

it("rejects pending jobs on terminate", async () => {
  runner = createWorkerRunner();
  const job = runner.run({ kind: "encodePng", input: image(4) });
  runner.terminate();
  await expect(job).rejects.toBeInstanceOf(Error);
  const after = await runner.run({ kind: "encodePng", input: image(4) });
  expect(after.length).toBeGreaterThan(0);
});
