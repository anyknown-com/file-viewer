import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blobSource } from "../../contract/byte-source";
import {
  type Fit,
  type ImageClip,
  type Project,
  SOURCE_ASSET_ID,
  type TextClip,
  type Track,
} from "../model/project";
import { TICKS_PER_SECOND } from "../model/time";
import { fixtureFile, fixtureRef } from "../test-utils/fixtures";
import { AssetStore } from "./assets";
import { FrameCache } from "./frame-cache";
import { ensureFonts, type FrameSources, renderFrame } from "./render-frame";

const SIZE = 180;
const S = TICKS_PER_SECOND;
let controller: AbortController;
let assets: AssetStore;
let frames: FrameCache;
let sources: FrameSources;

beforeEach(async () => {
  controller = new AbortController();
  const blue = await fixtureFile("blue-64.png");
  assets = new AssetStore({
    file: await fixtureRef("red-2s.webm"),
    provider: {
      list: async () => [{ id: "blue", name: blue.name, mime: blue.type, size: blue.size }],
      open: async () => blobSource(blue),
    },
    signal: controller.signal,
  });
  await assets.list();
  frames = new FrameCache(assets);
  sources = {
    frame: async (id, seconds) => (await frames.frameAt(id, seconds))?.canvas ?? null,
    image: (id) => assets.image(id),
  };
});

afterEach(() => {
  frames.dispose();
  controller.abort();
});

function project(fit: Fit, overlay: (ImageClip | TextClip)[] = []): Project {
  const tracks: Track<ImageClip | TextClip>[] = overlay.map((clip, i) => ({
    id: `o${i}`,
    muted: false,
    locked: false,
    clips: [clip],
  }));
  return {
    width: SIZE,
    height: SIZE,
    fps: 30,
    aspect: "1:1",
    source: { width: 320, height: 180 },
    tracks: {
      main: {
        id: "main",
        muted: false,
        locked: false,
        clips: [
          {
            id: "v",
            kind: "video",
            assetId: SOURCE_ASSET_ID,
            start: 0,
            in: 0,
            out: 2 * S,
            volume: 1,
            muted: false,
            fit,
          },
        ],
      },
      overlay: tracks,
      audio: [],
    },
  };
}

async function render(p: Project): Promise<OffscreenCanvasRenderingContext2D> {
  const ctx = new OffscreenCanvas(SIZE, SIZE).getContext("2d")!;
  await renderFrame(ctx, p, S / 2, sources);
  return ctx;
}

function pixel(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number): number[] {
  return [...ctx.getImageData(x, y, 1, 1).data];
}

const isRed = ([r, g]: number[]) => r! > 200 && g! < 60;

describe("renderFrame", () => {
  it("letterboxes the video with fit", async () => {
    const ctx = await render(project("fit"));
    expect(isRed(pixel(ctx, SIZE / 2, SIZE / 2))).toBe(true);
    expect(pixel(ctx, SIZE / 2, 2).slice(0, 3)).toEqual([0, 0, 0]);
  });

  it("covers the canvas with fill", async () => {
    const ctx = await render(project("fill"));
    expect(isRed(pixel(ctx, SIZE / 2, 2))).toBe(true);
  });

  it("draws white text on a background box", async () => {
    await ensureFonts();
    const text: TextClip = {
      id: "t",
      kind: "text",
      start: 0,
      duration: 2 * S,
      text: "HHH",
      size: 0.2,
      color: "#ffffff",
      background: true,
      x: 0.5,
      y: 0.5,
    };
    const ctx = await render(project("fit", [text]));
    const data = ctx.getImageData(SIZE / 2 - 30, SIZE / 2 - 15, 60, 30).data;
    let white = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 230 && data[i + 1]! > 230 && data[i + 2]! > 230) white++;
    }
    expect(white).toBeGreaterThan(0);
  });

  it("draws an image overlay", async () => {
    const image: ImageClip = {
      id: "i",
      kind: "image",
      assetId: "blue",
      start: 0,
      duration: 2 * S,
      x: 0.5,
      y: 0.5,
      width: 0.3,
    };
    const ctx = await render(project("fit", [image]));
    const [r, , b] = pixel(ctx, SIZE / 2, SIZE / 2);
    expect(b).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
  });
});
