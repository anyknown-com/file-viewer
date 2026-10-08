import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import type { EditorProps } from "../contract/editor";
import { ViewerError } from "../contract/errors";
import { en } from "../i18n/en";
import { AudioEditor } from "./audio-editor";
import { openTrack, type OpenedTrack } from "./open-track";
import { scanPeaks } from "./scan";

vi.mock("./open-track");
vi.mock("./scan");
// jsdom has no canvas 2d context, ResizeObserver or layout; the canvases are covered by view.test.ts.
vi.mock("./waveform", () => ({ Waveform: () => null }));
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
});
