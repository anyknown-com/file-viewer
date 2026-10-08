import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { videoMessages } from "../../messages";
import type { VideoClip } from "../../model/project";
import { secondsToTicks } from "../../model/time";
import { mockEngines, renderEditor } from "../../test-utils/editor-harness";
import type { EditorSession } from "../session";
import { ClipMedia } from "./clip-media";

vi.mock("../../../media/support");
vi.mock("../../engine/assets");
vi.mock("../../engine/frame-cache");
vi.mock("../../engine/playback");
vi.mock("../../engine/thumbnails");

const v = videoMessages.en;
const s = secondsToTicks;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ClipMedia", () => {
  it("asks for thumbnails of the visible part only", () => {
    const strip = vi.fn<(id: string, seconds: number[]) => Promise<(ImageBitmap | null)[]>>(() =>
      Promise.resolve([]),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const status = { state: "ready" as const, info: { hasAudio: false } };
    const session = { thumbs: { strip }, assets: { status: () => status } };
    // 20 s of source from 5 s in, placed at 2 s; 50 px/s, so the clip is 1000 px wide.
    const clip: VideoClip = {
      id: "v",
      kind: "video",
      assetId: "a",
      start: s(2),
      in: s(5),
      out: s(25),
      volume: 1,
      muted: false,
      fit: "fit",
    };
    render(
      <ClipMedia
        session={session as unknown as EditorSession}
        clip={clip}
        pps={50}
        visibleFrom={s(8)}
        visibleTo={s(14)}
      />,
    );
    expect(strip).toHaveBeenCalledOnce();
    const [, seconds] = strip.mock.calls[0]!;
    // Timeline 8–14 s is clip 6–12 s, which is source 11–17 s.
    expect(seconds.length).toBeGreaterThan(0);
    for (const t of seconds) {
      expect(t).toBeGreaterThanOrEqual(11);
      expect(t).toBeLessThanOrEqual(17);
    }
    // One per 64 px: 300 px on screen.
    expect(seconds.length).toBeGreaterThanOrEqual(4);
    expect(seconds.length).toBeLessThanOrEqual(5);
  });

  it("marks a clip whose media can't be played", async () => {
    mockEngines({ statuses: { source: { state: "unsupported", code: "codec_unsupported" } } });
    renderEditor();
    await screen.findByRole("button", { name: v["video.addText"] });
    const clip = document.querySelector<HTMLElement>('.fv-ve-clip[data-kind="video"]')!;
    expect(clip.hasAttribute("data-unsupported")).toBe(true);
    expect(clip.textContent).toContain(v["video.clip.unsupported"]);
  });
});
