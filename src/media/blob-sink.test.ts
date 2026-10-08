// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ViewerError } from "../contract/errors";
import { createBlobSink, DEFAULT_LAYOUT } from "./blob-sink";

const layout = { headBytes: 16, sealBytes: 32, keepBytes: 8 };

function setup(maxBytes?: number) {
  const sink = createBlobSink(maxBytes === undefined ? {} : { maxBytes }, layout);
  const writer = sink.writable.getWriter();
  const ref = new Uint8Array(200);
  let refSize = 0;
  let n = 1;
  async function write(position: number, length: number) {
    const data = new Uint8Array(length);
    for (let i = 0; i < length; i++) data[i] = n++ & 0xff;
    await writer.write({ type: "write", data, position });
    ref.set(data, position);
    refSize = Math.max(refSize, position + length);
  }
  async function sequential(total: number, step = 7) {
    for (let p = 0; p < total; p += step) await write(p, Math.min(step, total - p));
  }
  async function result() {
    await writer.close();
    const blob = sink.toBlob("x/y");
    expect(blob.type).toBe("x/y");
    return new Uint8Array(await blob.arrayBuffer());
  }
  const expected = () => ref.slice(0, refSize);
  return { sink, writer, write, sequential, result, expected };
}

describe("createBlobSink", () => {
  it("has the documented default layout", () => {
    expect(DEFAULT_LAYOUT).toEqual({ headBytes: 1048576, sealBytes: 67108864, keepBytes: 65536 });
  });

  it("collects sequential writes", async () => {
    const t = setup();
    await t.sequential(100);
    expect(t.sink.size).toBe(100);
    expect(await t.result()).toEqual(t.expected());
  });

  it("allows overwriting inside the head", async () => {
    const t = setup();
    await t.sequential(100);
    await t.write(4, 4);
    expect(await t.result()).toEqual(t.expected());
  });

  it("allows overwriting the unsealed tail", async () => {
    const t = setup();
    await t.sequential(100);
    await t.write(96, 4);
    expect(await t.result()).toEqual(t.expected());
  });

  it("rejects writes into the sealed range", async () => {
    const t = setup();
    await t.sequential(56, 56);
    await expect(t.write(20, 1)).rejects.toThrow(/sealed/);
  });

  it("allows writes before sealing happens", async () => {
    const t = setup();
    await t.sequential(55, 55);
    await t.write(20, 1);
    expect(await t.result()).toEqual(t.expected());
  });

  it("handles a write crossing the head boundary", async () => {
    const t = setup();
    await t.write(0, 10);
    await t.write(10, 12);
    expect(await t.result()).toEqual(t.expected());
  });

  it("handles a write crossing the seal point, then an overwrite", async () => {
    const t = setup();
    await t.write(0, 40);
    await t.write(40, 30);
    await t.write(66, 4);
    expect(await t.result()).toEqual(t.expected());
  });

  it("rejects writes past the end", async () => {
    const t = setup();
    await t.write(0, 10);
    await expect(t.write(12, 1)).rejects.toThrow(/past end/);
  });

  it("enforces maxBytes", async () => {
    const t = setup(50);
    await t.write(0, 50);
    const err = await t.write(50, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ViewerError);
    expect((err as ViewerError).code).toBe("output_too_large");
  });

  it("refuses toBlob before close", async () => {
    const t = setup();
    await t.write(0, 10);
    expect(() => t.sink.toBlob("x/y")).toThrow(/not closed/);
  });
});
