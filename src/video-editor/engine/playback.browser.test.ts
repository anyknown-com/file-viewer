import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ViewerError } from "../../contract/errors";
import { createProject, type Project, projectDuration, SOURCE_ASSET_ID } from "../model/project";
import { frameTicks, secondsToTicks } from "../model/time";
import { fixtureRef } from "../test-utils/fixtures";
import { AssetStore } from "./assets";
import { FrameCache } from "./frame-cache";
import { Player } from "./playback";

let controller: AbortController;
let frames: FrameCache;
let project: Project;
let player: Player;
let detach: () => void;
let contexts: AudioContext[];
const onError = vi.fn<(e: ViewerError) => void>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts playback from a real click: the AudioContext clock only runs after a user gesture. */
async function play(): Promise<void> {
  const button = document.createElement("button");
  button.textContent = "play";
  button.addEventListener("click", () => player.play());
  document.body.append(button);
  await userEvent.click(button);
  button.remove();
}

beforeEach(async () => {
  controller = new AbortController();
  const assets = new AssetStore({
    file: await fixtureRef("red-2s.webm"),
    signal: controller.signal,
  });
  await assets.list();
  project = createProject(await assets.load(SOURCE_ASSET_ID));
  frames = new FrameCache(assets);
  contexts = [];
  const Real = AudioContext;
  vi.stubGlobal(
    "AudioContext",
    class extends Real {
      constructor() {
        super();
        contexts.push(this);
      }
    },
  );
  player = new Player({ assets, frames, getProject: () => project, onTime: () => {}, onError });
  detach = player.attach(document.createElement("canvas"));
});

afterEach(() => {
  detach();
  frames.dispose();
  controller.abort();
  onError.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Player", () => {
  it("advances time while playing", async () => {
    await play();
    await sleep(300);
    expect(player.playing).toBe(true);
    expect(player.time).toBeGreaterThan(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it("holds time after pause", async () => {
    await play();
    await sleep(100);
    player.pause();
    const t = player.time;
    await sleep(100);
    expect(player.time).toBe(t);
  });

  it("steps exactly three frames", () => {
    player.seek(secondsToTicks(0.5));
    player.step(3);
    expect(player.time).toBe(secondsToTicks(0.5) + 3 * frameTicks(project.fps));
  });

  it("clamps a seek past the end", () => {
    player.seek(projectDuration(project) * 10);
    expect(player.time).toBe(projectDuration(project));
  });

  it("stops by itself at the end", async () => {
    const end = projectDuration(project);
    player.seek(end - secondsToTicks(0.2));
    await play();
    await vi.waitFor(() => expect(player.playing).toBe(false), { timeout: 2000 });
    expect(player.time).toBe(end);
  });

  it("stops at the end when no animation frame arrives", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    const end = projectDuration(project);
    player.seek(end - secondsToTicks(0.2));
    await play();
    await vi.waitFor(() => expect(player.playing).toBe(false), { timeout: 2000 });
    expect(player.time).toBe(end);
  });

  it("closes the AudioContext on cleanup", async () => {
    detach();
    await vi.waitFor(() => expect(contexts[0]!.state).toBe("closed"));
  });

  it("pauses and reports decode_failed when a frame read fails", async () => {
    vi.spyOn(frames, "frameAt").mockRejectedValue(new Error("boom"));
    await play();
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]![0].code).toBe("decode_failed");
    expect(player.playing).toBe(false);
  });
});
