import { describe, expect, it } from "vitest";
import {
  blobSource,
  bytesSource,
  readBlob,
  READ_CHUNK_BYTES,
  type ByteSource,
} from "./byte-source";
import { ViewerError } from "./errors";

const Mi = 1024 * 1024;
const text = (u: Uint8Array) => new TextDecoder().decode(u);

function fake(size: number, read?: ByteSource["read"]) {
  const calls: [number, number][] = [];
  const source: ByteSource = {
    size,
    read:
      read ??
      (async (s, e) => {
        calls.push([s, e]);
        return new Uint8Array(e - s);
      }),
  };
  return { source, calls };
}

describe("blobSource", () => {
  it("reads ranges and validates them", async () => {
    const blob = new Blob(["hello"]);
    const s = blobSource(blob);
    expect(s.size).toBe(5);
    expect(text(await s.read(1, 4))).toBe("ell");
    expect((await s.read(0, 0)).length).toBe(0);
    await expect(s.read(2, 1)).rejects.toBeInstanceOf(RangeError);
    await expect(s.read(0, 6)).rejects.toBeInstanceOf(RangeError);
    expect(await s.blob?.()).toBe(blob);
  });

  it("rejects with AbortError on an aborted signal", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(blobSource(new Blob(["x"])).read(0, 1, ac.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("bytesSource", () => {
  it("returns copies and a blob", async () => {
    const s = bytesSource(new Uint8Array([1, 2, 3]));
    const a = await s.read(0, 3);
    a[0] = 9;
    expect((await s.read(0, 3))[0]).toBe(1);
    expect((await s.blob?.())?.size).toBe(3);
  });
});

describe("readBlob", () => {
  it("retypes a blob from source.blob()", async () => {
    const out = await readBlob(blobSource(new Blob(["abc"])), { type: "image/png" });
    expect(out.type).toBe("image/png");
    expect(await out.text()).toBe("abc");
  });

  it("reads read-only sources in 4 MiB chunks", async () => {
    const { source, calls } = fake(9 * Mi);
    const out = await readBlob(source, { type: "" });
    expect(READ_CHUNK_BYTES).toBe(4 * Mi);
    expect(calls).toEqual([
      [0, 4 * Mi],
      [4 * Mi, 8 * Mi],
      [8 * Mi, 9 * Mi],
    ]);
    expect(out.size).toBe(9 * Mi);
  });

  it("wraps a short read as read_failed", async () => {
    const { source } = fake(10, async () => new Uint8Array(3));
    const err = await readBlob(source, { type: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ViewerError);
    expect((err as ViewerError).code).toBe("read_failed");
  });

  it("wraps read errors as read_failed with cause", async () => {
    const { source } = fake(10, async () => {
      throw new Error("boom");
    });
    const err = await readBlob(source, { type: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ViewerError);
    expect((err as ViewerError).code).toBe("read_failed");
    expect(((err as ViewerError).cause as Error).message).toBe("boom");
  });

  it("passes abort errors through unwrapped", async () => {
    const ac = new AbortController();
    const { source } = fake(9 * Mi, async (s, e, signal) => {
      signal?.throwIfAborted();
      ac.abort();
      return new Uint8Array(e - s);
    });
    const err = await readBlob(source, { type: "", signal: ac.signal }).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ViewerError);
    expect((err as Error).name).toBe("AbortError");
  });
});
