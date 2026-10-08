import { CanvasSink } from "mediabunny";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOURCE_ASSET_ID } from "../model/project";
import { fixtureRef } from "../test-utils/fixtures";
import { AssetStore } from "./assets";
import { FrameCache } from "./frame-cache";

const FPS = 30;
let controller: AbortController;
let cache: FrameCache;

beforeEach(async () => {
  controller = new AbortController();
  const assets = new AssetStore({
    file: await fixtureRef("green-3s.webm"),
    signal: controller.signal,
  });
  cache = new FrameCache(assets);
});

afterEach(() => {
  cache.dispose();
  controller.abort();
  vi.restoreAllMocks();
});

const at = (seconds: number) => cache.frameAt(SOURCE_ASSET_ID, seconds);

describe("FrameCache", () => {
  it("returns the frame that covers the requested time", async () => {
    const frame = (await at(1.5))!;
    expect(frame.timestamp).toBeLessThanOrEqual(1.5);
    expect(frame.timestamp + frame.duration).toBeGreaterThan(1.5);
  });

  it("walks the iterator forward instead of seeking for each frame", async () => {
    const canvases = vi.spyOn(CanvasSink.prototype, "canvases");
    for (let i = 0; i <= FPS; i++) {
      const t = i / FPS;
      // oxlint-disable-next-line no-await-in-loop -- frames are requested in playback order
      const frame = (await at(t))!;
      expect(frame.timestamp).toBeLessThanOrEqual(t);
      expect(frame.timestamp + frame.duration).toBeGreaterThan(t);
    }
    expect(canvases).toHaveBeenCalledTimes(1);
  });

  it("seeks again for a jump past the iterate window", async () => {
    const canvases = vi.spyOn(CanvasSink.prototype, "canvases");
    await at(0);
    const frame = (await at(2.5))!;
    expect(frame.timestamp).toBeLessThanOrEqual(2.5);
    expect(frame.timestamp + frame.duration).toBeGreaterThan(2.5);
    expect(canvases).toHaveBeenCalledTimes(2);
  });

  it("keeps only the last of two concurrent seeks", async () => {
    const [, last] = await Promise.all([at(2.5), at(0.5)]);
    expect(last!.timestamp).toBeLessThanOrEqual(0.5);
    expect(last!.timestamp + last!.duration).toBeGreaterThan(0.5);
    const canvases = vi.spyOn(CanvasSink.prototype, "canvases");
    expect(await at(0.5)).toBe(last);
    expect(canvases).not.toHaveBeenCalled();
  });

  it("rebuilds the sink after drop", async () => {
    const canvases = vi.spyOn(CanvasSink.prototype, "canvases");
    await at(0.5);
    cache.drop(SOURCE_ASSET_ID);
    const frame = (await at(0.5))!;
    expect(frame.timestamp).toBeLessThanOrEqual(0.5);
    expect(canvases).toHaveBeenCalledTimes(2);
    expect(canvases.mock.contexts[1]).not.toBe(canvases.mock.contexts[0]);
  });
});
