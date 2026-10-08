import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../../contract/byte-source";
import type { EditorProps } from "../../contract/editor";
import { ViewerError } from "../../contract/errors";
import { en } from "../../i18n/en";
import { hasVideoCodecs } from "../../media/support";
import { AssetStore } from "../engine/assets";
import { videoMessages } from "../messages";
import type { AssetMeta } from "../model/project";
import { secondsToTicks } from "../model/time";
import { VideoEditor } from "./video-editor";

vi.mock("../../media/support");
vi.mock("../engine/assets");
vi.mock("../engine/frame-cache");
vi.mock("../engine/playback");
vi.mock("../engine/thumbnails");

const v = videoMessages.en;
const source: AssetMeta = {
  id: "source",
  name: "clip.mp4",
  kind: "video",
  duration: secondsToTicks(10),
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
};

// jsdom has no ResizeObserver; this one reports a fixed container width once observed.
let width = 1280;
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    const entry = { target: el, contentRect: { width } } as unknown as ResizeObserverEntry;
    this.cb([entry], this as unknown as ResizeObserver);
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  width = 1280;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.mocked(hasVideoCodecs).mockReturnValue(true);
  vi.mocked(AssetStore.prototype.load).mockResolvedValue(source);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(over: Partial<EditorProps> = {}) {
  const props: EditorProps = {
    file: { name: "clip.mp4", mime: "video/mp4", source: bytesSource(new Uint8Array(8)) },
    onSave: vi.fn<EditorProps["onSave"]>(),
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(e: ViewerError) => void>(),
    onDirtyChange: vi.fn<(dirty: boolean) => void>(),
    ...over,
  };
  render(<VideoEditor {...props} />);
  return { props, user: userEvent.setup() };
}

describe("VideoEditor shell", () => {
  it("explains a missing WebCodecs and goes back to the preview", async () => {
    vi.mocked(hasVideoCodecs).mockReturnValue(false);
    const { props, user } = setup();
    expect(await screen.findByText(v["video.notice.noWebCodecs"])).toBeTruthy();
    await user.click(screen.getByRole("button", { name: v["video.notice.back"] }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("asks for a wider window below 768 px", async () => {
    width = 600;
    setup();
    expect(await screen.findByText(v["video.notice.narrow"])).toBeTruthy();
  });

  it("shows the codec notice and reports the error when the source can't be decoded", async () => {
    const error = new ViewerError("codec_unsupported");
    vi.mocked(AssetStore.prototype.load).mockRejectedValue(error);
    const { props } = setup();
    expect(await screen.findByText(v["video.notice.codec"])).toBeTruthy();
    expect(props.onError).toHaveBeenCalledWith(error);
  });

  it("shows the read notice when the source can't be read", async () => {
    vi.mocked(AssetStore.prototype.load).mockRejectedValue(new ViewerError("read_failed"));
    setup();
    expect(await screen.findByText(v["video.notice.readFailed"])).toBeTruthy();
  });

  it("closes right away without changes", async () => {
    const { props, user } = setup();
    await user.click(await screen.findByRole("button", { name: en["common.close"] }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("asks before closing after a change and stays on cancel", async () => {
    const { props, user } = setup();
    await user.click(await screen.findByRole("button", { name: v["video.addText"] }));
    await user.click(screen.getByRole("button", { name: en["common.close"] }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: en["discard.keep"] }));
    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: v["video.export"] })).toBeTruthy();
  });

  it("reports dirty on the first change", async () => {
    const { props, user } = setup();
    await user.click(await screen.findByRole("button", { name: v["video.addText"] }));
    expect(props.onDirtyChange).toHaveBeenCalledWith(true);
    expect(props.onDirtyChange).toHaveBeenCalledOnce();
  });
});
