// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource, type ByteSource } from "../contract/byte-source";
import { ViewerError } from "../contract/errors";
import { openMedia } from "./open-media";

afterEach(() => vi.unstubAllGlobals());

function fixture(name: string): ByteSource {
  return bytesSource(new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));
}

async function codeOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e instanceof ViewerError ? e.code : e;
  }
  return "resolved";
}

describe("openMedia", () => {
  it("opens wav for audio", async () => {
    const m = await openMedia(fixture("tone-1s.wav"), "audio");
    expect(m.audio).not.toBeNull();
    expect(m.video).toBeNull();
    expect(Math.abs(m.duration - 1)).toBeLessThan(0.01);
    m.dispose();
  });

  it("reports webcodecs_unavailable for video without VideoDecoder", async () => {
    expect(await codeOf(openMedia(fixture("clip-1s.mp4"), "video"))).toBe("webcodecs_unavailable");
  });

  it("reports codec_unsupported when the decoder rejects the config", async () => {
    vi.stubGlobal("VideoDecoder", { isConfigSupported: async () => ({ supported: false }) });
    expect(await codeOf(openMedia(fixture("clip-1s.mp4"), "video"))).toBe("codec_unsupported");
  });

  it("drops undecodable audio without failing", async () => {
    vi.stubGlobal("VideoDecoder", { isConfigSupported: async () => ({ supported: true }) });
    const m = await openMedia(fixture("clip-1s.mp4"), "video");
    expect(m.video).not.toBeNull();
    expect(m.audio).toBeNull();
    m.dispose();
  });

  it("reports webcodecs_unavailable for audio without AudioDecoder", async () => {
    expect(await codeOf(openMedia(fixture("clip-1s.mp4"), "audio"))).toBe("webcodecs_unavailable");
  });

  it("reports unsupported for unknown containers", async () => {
    const src = bytesSource(new TextEncoder().encode("not media at all"));
    expect(await codeOf(openMedia(src, "video"))).toBe("unsupported");
  });

  it("reports unsupported when there is no video track", async () => {
    expect(await codeOf(openMedia(fixture("tone-1s.wav"), "video"))).toBe("unsupported");
  });

  it("reports read_failed with the cause chain", async () => {
    const src: ByteSource = { size: 1000, read: () => Promise.reject(new Error("disk gone")) };
    let err: unknown;
    try {
      await openMedia(src, "video");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ViewerError);
    expect((err as ViewerError).code).toBe("read_failed");
    let found = false;
    for (let c: unknown = err; c instanceof Error; c = c.cause) {
      if (c.message === "disk gone") found = true;
    }
    expect(found).toBe(true);
  });

  it("rejects with signal.reason on abort", async () => {
    const controller = new AbortController();
    const src: ByteSource = {
      size: 1000,
      read: (_s, _e, signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    };
    const p = openMedia(src, "video", controller.signal);
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await expect(p).rejects.toBe(controller.signal.reason);
  });

  it("rejects with signal.reason without reading when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn<ByteSource["read"]>();
    const p = openMedia({ size: 10, read }, "video", controller.signal);
    await expect(p).rejects.toBe(controller.signal.reason);
    expect(read).not.toHaveBeenCalled();
  });
});
