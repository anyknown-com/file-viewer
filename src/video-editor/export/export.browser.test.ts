import { ALL_FORMATS, BlobSource, Input, Output } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blobSource } from "../../contract/byte-source";
import { ViewerError } from "../../contract/errors";
import { AssetStore } from "../engine/assets";
import {
  type AudioClip,
  createProject,
  type Project,
  projectDuration,
  SOURCE_ASSET_ID,
  type TextClip,
  type VideoClip,
} from "../model/project";
import { secondsToTicks, ticksToSeconds } from "../model/time";
import { fixtureFile, fixtureRef } from "../test-utils/fixtures";
import { type ExportProgress, runExport } from "./export";
import { DEFAULT_MAX_OUTPUT_BYTES, exportPresets, pickAudioCodec } from "./settings";

// Encodes are slow on shared CI runners; give each one room.
const SLOW_CI = 60_000;

const stores: AssetStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.dispose();
  vi.restoreAllMocks();
});

const track = (id: string) => ({ id, muted: false, locked: false });

/** red 0–2 s, green's first second, red's last second, a text clip and a 2 s tone: 4 s in all. */
async function setup(): Promise<{ store: AssetStore; project: Project }> {
  const files = {
    green: await fixtureFile("green-3s.webm"),
    tone: await fixtureFile("tone-2s.ogg"),
  };
  const store = new AssetStore({
    file: await fixtureRef("red-2s.webm"),
    provider: {
      list: async () =>
        Object.entries(files).map(([id, f]) => ({ id, name: f.name, mime: f.type, size: f.size })),
      open: async (id) => blobSource(files[id as keyof typeof files]),
    },
    signal: new AbortController().signal,
  });
  stores.push(store);
  await store.list();
  const meta = await store.load(SOURCE_ASSET_ID);
  await store.load("green");
  await store.load("tone");
  const project = createProject(meta);
  const s = secondsToTicks;
  const red = project.tracks.main.clips[0]!;
  const video = (id: string, assetId: string, start: number, from: number, to: number) =>
    ({ ...red, id, assetId, start: s(start), in: s(from), out: s(to) }) satisfies VideoClip;
  const text: TextClip = {
    id: "text",
    kind: "text",
    start: 0,
    duration: s(2),
    text: "Hello",
    size: 0.1,
    color: "#ffffff",
    background: true,
    x: 0.5,
    y: 0.8,
  };
  const tone: AudioClip = {
    id: "tone",
    kind: "audio",
    assetId: "tone",
    start: s(1),
    in: 0,
    out: s(2),
    volume: 1,
    muted: false,
  };
  return {
    store,
    project: {
      ...project,
      tracks: {
        overlay: [{ ...track("o1"), clips: [text] }],
        main: {
          ...project.tracks.main,
          clips: [
            video("a", SOURCE_ASSET_ID, 0, 0, 2),
            video("b", "green", 2, 0, 1),
            video("c", SOURCE_ASSET_ID, 3, 1, 2),
          ],
        },
        audio: [{ ...track("a1"), clips: [tone] }],
      },
    },
  };
}

async function exportProject(
  o: { maxOutputBytes?: number; signal?: AbortSignal; onProgress?(p: ExportProgress): void } = {},
) {
  const { store, project } = await setup();
  const blob = await runExport({
    project,
    assets: store,
    preset: exportPresets(project).find((p) => p.id === "original")!,
    audioCodec: await pickAudioCodec(),
    maxOutputBytes: o.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    signal: o.signal ?? new AbortController().signal,
    onProgress: o.onProgress ?? (() => undefined),
  });
  return { blob, project };
}

describe("runExport", () => {
  it(
    "writes an H.264 MP4 with audio that lasts as long as the project",
    async () => {
      const progress: ExportProgress[] = [];
      const { blob, project } = await exportProject({ onProgress: (p) => progress.push(p) });
      expect(blob.type).toBe("video/mp4");
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      try {
        const video = (await input.getPrimaryVideoTrack())!;
        const audio = (await input.getPrimaryAudioTrack())!;
        expect(video.codec).toBe("avc");
        expect(audio).not.toBeNull();
        const expected = ticksToSeconds(projectDuration(project));
        expect(Math.abs((await video.computeDuration()) - expected)).toBeLessThan(1 / project.fps);
        // The file's duration counts the audio track too: within one AAC frame of the project.
        expect(Math.abs((await input.computeDuration()) - expected)).toBeLessThanOrEqual(
          1024 / 48_000,
        );
      } finally {
        input.dispose();
      }
      expect(progress.at(-1)?.done).toBe(1);
    },
    SLOW_CI,
  );

  it(
    "cancels the output when aborted",
    async () => {
      const cancel = vi.spyOn(Output.prototype, "cancel");
      const controller = new AbortController();
      const run = exportProject({
        signal: controller.signal,
        onProgress: () => controller.abort(),
      });
      await expect(run).rejects.toMatchObject({ name: "AbortError" });
      expect(cancel).toHaveBeenCalledTimes(1);
    },
    SLOW_CI,
  );

  it(
    "rejects with output_too_large past maxOutputBytes",
    async () => {
      const run = exportProject({ maxOutputBytes: 1024 });
      await expect(run).rejects.toBeInstanceOf(ViewerError);
      await expect(run).rejects.toMatchObject({ code: "output_too_large" });
    },
    SLOW_CI,
  );
});
