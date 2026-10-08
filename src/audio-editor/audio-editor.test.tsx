import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import type { EditorProps } from "../contract/editor";
import { ViewerError } from "../contract/errors";
import { en } from "../i18n/en";
import { AudioEditor } from "./audio-editor";
import { audioMessages } from "./messages";
import { openTrack, type OpenedTrack } from "./open-track";
import { scanPeaks } from "./scan";
import type { WaveformProps } from "./waveform";

vi.mock("./open-track");
vi.mock("./scan");
// jsdom has no canvas 2d context, ResizeObserver or layout; the canvases are covered by view.test.ts.
// The stand-in sizes the view to 100 px per second and keeps the selection overlay.
vi.mock("./waveform", () => ({
  Waveform: (p: WaveformProps) => (
    <div
      ref={(el) => {
        if (el && p.view.width === 0)
          p.onViewChange({ start: 0, secondsPerPixel: 0.01, width: 1000 });
      }}
    >
      {p.overlay}
    </div>
  ),
}));
vi.mock("./overview", () => ({ Overview: () => null }));

let dispose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  dispose = vi.fn<() => void>();
  vi.mocked(openTrack).mockReset();
  vi.mocked(openTrack).mockResolvedValue({
    track: {},
    duration: 10,
    sampleRate: 48000,
    channels: 2,
    codec: "pcm-s16",
    dispose,
  } as unknown as OpenedTrack);
  vi.mocked(scanPeaks).mockReset();
  vi.mocked(scanPeaks).mockReturnValue(new Promise(() => {}));
});

afterEach(cleanup);

function setup(over: Partial<EditorProps> = {}) {
  const props: EditorProps = {
    file: { name: "take-1.wav", mime: "audio/wav", source: bytesSource(new Uint8Array(8)) },
    onSave: vi.fn<EditorProps["onSave"]>(),
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(e: ViewerError) => void>(),
    ...over,
  };
  const view = render(<AudioEditor {...props} />);
  return { props, view, user: userEvent.setup() };
}

async function splitAt3(over: Partial<EditorProps> = {}) {
  const ctx = setup({ onDirtyChange: vi.fn<(dirty: boolean) => void>(), ...over });
  const layer = await vi.waitFor(() => {
    const el = ctx.view.container.querySelector<HTMLElement>(".fv-audio-layer");
    if (!el) throw new Error("no selection layer yet");
    return el;
  });
  // A click (no movement) at x = 300 puts the playhead at 3 s.
  fireEvent.pointerDown(layer, { pointerId: 1, clientX: 300, button: 0 });
  fireEvent.pointerUp(layer, { pointerId: 1, clientX: 300 });
  await ctx.user.click(screen.getByRole("button", { name: audioMessages.en["audio.split"] }));
  return ctx;
}

describe("AudioEditor", () => {
  it("shows the file name", async () => {
    setup();
    expect(await screen.findByText("take-1.wav")).toBeTruthy();
  });

  it("shows codec_unsupported and reports it", async () => {
    vi.mocked(openTrack).mockRejectedValue(new ViewerError("codec_unsupported"));
    const { props } = setup();
    expect(await screen.findByText(en["error.codec_unsupported"])).toBeTruthy();
    expect(props.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "codec_unsupported" }),
    );
  });

  it("shows webcodecs_unavailable", async () => {
    vi.mocked(openTrack).mockRejectedValue(new ViewerError("webcodecs_unavailable"));
    setup();
    expect(await screen.findByText(en["error.webcodecs_unavailable"])).toBeTruthy();
  });

  it("closes right away when nothing changed", async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole("button", { name: en["common.close"] }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape when nothing changed", async () => {
    const { props, user, view } = setup();
    const root = view.container.querySelector<HTMLElement>(".fv-audio");
    root?.focus();
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("aborts reads and disposes the track on unmount", async () => {
    const { view } = setup();
    await vi.waitFor(() => expect(scanPeaks).toHaveBeenCalled());
    const signal = vi.mocked(openTrack).mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(dispose).toHaveBeenCalled();
  });

  describe("after an edit", () => {
    it("reports dirty after a split", async () => {
      const { props } = await splitAt3();
      expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    });

    it("asks before closing and closes only on discard", async () => {
      const { props, user } = await splitAt3();
      await user.click(screen.getByRole("button", { name: en["common.close"] }));
      expect(await screen.findByText(en["discard.title"])).toBeTruthy();
      expect(props.onClose).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: en["discard.confirm"] }));
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("keeps editing closes the dialog without closing the editor", async () => {
      const { props, user } = await splitAt3();
      await user.click(screen.getByRole("button", { name: en["common.close"] }));
      await user.click(await screen.findByRole("button", { name: en["discard.keep"] }));
      await vi.waitFor(() => expect(screen.queryByText(en["discard.title"])).toBeNull());
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it("asks on Escape too", async () => {
      const { props, user, view } = await splitAt3();
      view.container.querySelector<HTMLElement>(".fv-audio")?.focus();
      await user.keyboard("{Escape}");
      expect(await screen.findByText(en["discard.title"])).toBeTruthy();
      expect(props.onClose).not.toHaveBeenCalled();
    });
  });
});
