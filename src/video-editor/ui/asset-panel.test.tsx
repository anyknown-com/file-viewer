import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetEntry } from "../engine/assets";
import { videoMessages } from "../messages";
import type { AssetMeta } from "../model/project";
import { secondsToTicks } from "../model/time";
import { mockEngines, renderEditor } from "../test-utils/editor-harness";

vi.mock("../../media/support");
vi.mock("../engine/assets");
vi.mock("../engine/frame-cache");
vi.mock("../engine/playback");
vi.mock("../engine/thumbnails");

const v = videoMessages.en;
const s = secondsToTicks;

const entries: AssetEntry[] = [
  { id: "music", name: "Music.mp3", mime: "audio/mpeg", size: 8, kind: "audio" },
  { id: "logo", name: "Logo.png", mime: "image/png", size: 8, kind: "image" },
];
const music: AssetMeta = {
  id: "music",
  name: "Music.mp3",
  kind: "audio",
  duration: s(2),
  width: 0,
  height: 0,
  fps: null,
  hasAudio: true,
};

const panel = () => document.querySelector<HTMLElement>(".fv-ve-assets")!;
const rowOf = (name: string) => within(panel()).getByText(name).closest("li")!;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AssetPanel", () => {
  it("filters by name, ignoring case", async () => {
    mockEngines({ entries });
    const { user } = renderEditor();
    await screen.findByRole("searchbox");
    expect(await within(panel()).findByText("Logo.png")).toBeTruthy();
    await user.type(screen.getByRole("searchbox", { name: v["video.assets.search"] }), "LOGO");
    expect(within(panel()).getByText("Logo.png")).toBeTruthy();
    expect(within(panel()).queryByText("Music.mp3")).toBeNull();
    expect(within(panel()).queryByText("clip.mp4")).toBeNull();
    await user.type(screen.getByRole("searchbox"), "x");
    expect(within(panel()).getByText(v["video.assets.empty"])).toBeTruthy();
  });

  it("adds the asset at the playhead with +", async () => {
    mockEngines({ entries, metas: [music] });
    const { user, session } = renderEditor();
    await screen.findByRole("searchbox");
    await within(panel()).findByText("Music.mp3");
    act(() => session().setPlayhead(s(3)));
    await user.click(
      within(rowOf("Music.mp3")).getByRole("button", { name: v["video.assets.add"] }),
    );
    await vi.waitFor(() => expect(session().history?.project.tracks.audio).toHaveLength(1));
    const [clip] = session().history!.project.tracks.audio[0]!.clips;
    expect(clip).toMatchObject({ kind: "audio", assetId: "music", start: s(3) });
  });

  it("explains an asset that can't be played", async () => {
    mockEngines({
      entries,
      statuses: { music: { state: "unsupported", code: "codec_unsupported" } },
    });
    renderEditor();
    await screen.findByRole("searchbox");
    await within(panel()).findByText("Music.mp3");
    expect(within(rowOf("Music.mp3")).getByText(v["video.clip.unsupported"])).toBeTruthy();
    expect(within(rowOf("Logo.png")).queryByText(v["video.clip.unsupported"])).toBeNull();
  });
});
