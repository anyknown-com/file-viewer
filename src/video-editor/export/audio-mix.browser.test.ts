import { afterEach, describe, expect, it } from "vitest";
import { blobSource } from "../../contract/byte-source";
import { AssetStore } from "../engine/assets";
import { type AudioClip, createProject, type Project, SOURCE_ASSET_ID } from "../model/project";
import { secondsToTicks } from "../model/time";
import { fixtureFile, fixtureRef } from "../test-utils/fixtures";
import { mixAudio } from "./audio-mix";

const stores: AssetStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.dispose();
});

/** `red-2s.webm` (440 Hz) as the source, `tone-2s.ogg` (660 Hz) as asset "tone"; both loaded. */
async function setup(): Promise<{ store: AssetStore; project: Project }> {
  const tone = await fixtureFile("tone-2s.ogg");
  const store = new AssetStore({
    file: await fixtureRef("red-2s.webm"),
    provider: {
      list: async () => [{ id: "tone", name: tone.name, mime: tone.type, size: tone.size }],
      open: async () => blobSource(tone),
    },
    signal: new AbortController().signal,
  });
  stores.push(store);
  await store.list();
  const meta = await store.load(SOURCE_ASSET_ID);
  await store.load("tone");
  const project = createProject(meta);
  const main = project.tracks.main.clips[0]!;
  project.tracks.main.clips[0] = { ...main, out: secondsToTicks(2) };
  return { store, project };
}

function withMain(p: Project, patch: { volume?: number; muted?: boolean }): Project {
  const main = p.tracks.main.clips[0]!;
  return {
    ...p,
    tracks: { ...p.tracks, main: { ...p.tracks.main, clips: [{ ...main, ...patch }] } },
  };
}

function withTone(p: Project): Project {
  const clip: AudioClip = {
    id: "tone-clip",
    kind: "audio",
    assetId: "tone",
    start: 0,
    in: 0,
    out: secondsToTicks(2),
    volume: 1,
    muted: false,
  };
  const track = { id: "a1", muted: false, locked: false, clips: [clip] };
  return { ...p, tracks: { ...p.tracks, audio: [track] } };
}

function peak(buffer: AudioBuffer, from = 0, to = buffer.length): number {
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = from; i < to; i++) max = Math.max(max, Math.abs(data[i]!));
  }
  return max;
}

describe("mixAudio", () => {
  it("renders exactly one second of stereo at 48 kHz", async () => {
    const { store, project } = await setup();
    const out = await mixAudio(project, store, 0, secondsToTicks(1));
    expect(out.length).toBe(48_000);
    expect(out.numberOfChannels).toBe(2);
    expect(out.sampleRate).toBe(48_000);
    expect(peak(out)).toBeGreaterThan(0.01);
  });

  it("halves the peak at volume 0.5", async () => {
    const { store, project } = await setup();
    const full = peak(await mixAudio(project, store, 0, secondsToTicks(1)));
    const half = peak(
      await mixAudio(withMain(project, { volume: 0.5 }), store, 0, secondsToTicks(1)),
    );
    expect(half / full).toBeGreaterThan(0.45);
    expect(half / full).toBeLessThan(0.55);
  });

  it("renders silence for a muted clip", async () => {
    const { store, project } = await setup();
    const out = await mixAudio(withMain(project, { muted: true }), store, 0, secondsToTicks(1));
    expect(peak(out)).toBe(0);
  });

  it("sums overlapping clips", async () => {
    const { store, project } = await setup();
    const single = peak(await mixAudio(project, store, 0, secondsToTicks(1)));
    const both = peak(await mixAudio(withTone(project), store, 0, secondsToTicks(1)));
    expect(both).toBeGreaterThan(single * 1.2);
  });

  it("mixes from the middle of a clip and stays silent past its end", async () => {
    const { store, project } = await setup();
    const out = await mixAudio(project, store, secondsToTicks(1.5), secondsToTicks(2.5));
    expect(out.length).toBe(48_000);
    expect(peak(out, 0, 24_000)).toBeGreaterThan(0.01);
    expect(peak(out, 24_000)).toBe(0);
  });
});
