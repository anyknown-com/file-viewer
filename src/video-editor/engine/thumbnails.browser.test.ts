import { CanvasSink, type WrappedCanvas } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blobSource } from "../../contract/byte-source";
import { SOURCE_ASSET_ID } from "../model/project";
import { fixtureFile, fixtureRef } from "../test-utils/fixtures";
import { AssetStore } from "./assets";
import { MAX_THUMBS, Thumbnails } from "./thumbnails";

const controllers: AbortController[] = [];
const thumbs: Thumbnails[] = [];

afterEach(() => {
  for (const t of thumbs.splice(0)) t.dispose();
  for (const c of controllers.splice(0)) c.abort();
  vi.restoreAllMocks();
});

async function thumbsFor(name: string): Promise<Thumbnails> {
  const c = new AbortController();
  controllers.push(c);
  const t = new Thumbnails(new AssetStore({ file: await fixtureRef(name), signal: c.signal }));
  thumbs.push(t);
  return t;
}

describe("Thumbnails.strip", () => {
  it("returns 48 px high bitmaps for each requested time", async () => {
    const t = await thumbsFor("green-3s.webm");
    const strip = await t.strip(SOURCE_ASSET_ID, [0, 1, 2]);
    expect(strip).toHaveLength(3);
    for (const bitmap of strip) expect(bitmap?.height).toBe(48);
  });

  it("does not decode the same times twice", async () => {
    const t = await thumbsFor("green-3s.webm");
    const spy = vi.spyOn(CanvasSink.prototype, "canvasesAtTimestamps");
    const first = await t.strip(SOURCE_ASSET_ID, [0, 1, 2]);
    const second = await t.strip(SOURCE_ASSET_ID, [0, 1.02, 2]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("evicts and closes the oldest bitmap when the 301st comes in", async () => {
    const t = await thumbsFor("green-3s.webm");
    const spy = vi.spyOn(CanvasSink.prototype, "canvasesAtTimestamps");
    const [oldest] = await t.strip(SOURCE_ASSET_ID, [0]);
    expect(oldest!.height).toBe(48);
    spy.mockImplementation(async function* (timestamps): AsyncGenerator<WrappedCanvas | null> {
      for await (const timestamp of timestamps) {
        const canvas = new OffscreenCanvas(85, 48);
        canvas.getContext("2d")!.fillRect(0, 0, 85, 48);
        yield { canvas, timestamp, duration: 0.1 };
      }
    });
    const rest = Array.from({ length: MAX_THUMBS }, (_, i) => (i + 1) / 10);
    await t.strip(SOURCE_ASSET_ID, rest);
    expect(oldest!.height).toBe(0);
    spy.mockClear();
    await t.strip(SOURCE_ASSET_ID, [rest[0]!]);
    expect(spy).not.toHaveBeenCalled();
    await t.strip(SOURCE_ASSET_ID, [0]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("Thumbnails.peaks", () => {
  it("measures a tone in every bucket", async () => {
    const c = new AbortController();
    controllers.push(c);
    const tone = await fixtureFile("tone-2s.ogg");
    const assets = new AssetStore({
      file: await fixtureRef("green-3s.webm"),
      provider: {
        list: async () => [{ id: "tone", name: tone.name, mime: tone.type, size: tone.size }],
        open: async () => blobSource(tone),
      },
      signal: c.signal,
    });
    await assets.list();
    const t = new Thumbnails(assets);
    thumbs.push(t);
    const peaks = await t.peaks("tone", 0, 2, 100);
    expect(peaks).toHaveLength(100);
    for (const v of peaks) {
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(await t.peaks("tone", 0, 2, 100)).toBe(peaks);
  });

  it("returns zeros for a video without audio", async () => {
    const t = await thumbsFor("silent-1s.webm");
    const peaks = await t.peaks(SOURCE_ASSET_ID, 0, 1, 20);
    expect(peaks).toEqual(new Float32Array(20));
  });
});
