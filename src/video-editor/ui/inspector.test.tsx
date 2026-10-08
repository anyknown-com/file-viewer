import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { videoMessages } from "../messages";
import { History } from "../model/history";
import { findClip, type VideoClip } from "../model/project";
import { mockEngines, renderEditor } from "../test-utils/editor-harness";

vi.mock("../../media/support");
vi.mock("../engine/assets");
vi.mock("../engine/frame-cache");
vi.mock("../engine/playback");
vi.mock("../engine/thumbnails");
// Base UI measures the track to turn pointer moves into values, which jsdom cannot do. This
// stand-in keeps the contract: `change` is a value while dragging, `pointerup` is the release.
vi.mock("../../primitives/slider", () => ({
  Slider: (p: {
    label: string;
    value: number;
    onValueChange(v: number): void;
    onValueCommitted?(v: number): void;
  }) => (
    <input
      type="range"
      aria-label={p.label}
      min={0}
      max={400}
      value={p.value}
      onChange={(e) => p.onValueChange(Number(e.target.value))}
      onPointerUp={(e) => p.onValueCommitted?.(Number(e.currentTarget.value))}
    />
  ),
}));

const v = videoMessages.en;
const inspector = () => within(document.querySelector<HTMLElement>(".fv-ve-inspector")!);
const clipOf = (kind: string) =>
  document.querySelector<HTMLElement>(`.fv-ve-clip[data-kind="${kind}"]`)!;

function select(el: HTMLElement, shiftKey = false) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 0, shiftKey });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 0 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Inspector", () => {
  it("edits a text clip's words as one more step", async () => {
    mockEngines({});
    const { user } = renderEditor();
    await user.click(await screen.findByRole("button", { name: v["video.addText"] }));
    select(clipOf("text"));
    const run = vi.spyOn(History.prototype, "run");
    const text = inspector().getByRole("textbox", { name: v["video.inspector.text"] });
    fireEvent.change(text, { target: { value: "Hello" } });
    expect(run).toHaveBeenCalledOnce();
    expect(clipOf("text").textContent).toContain("Hello");
  });

  it("runs the volume only on release, as one step", async () => {
    mockEngines({});
    const { session } = renderEditor();
    await screen.findByRole("button", { name: v["video.addText"] });
    select(clipOf("video"));
    const run = vi.spyOn(History.prototype, "run");
    const volume = inspector().getByRole("slider", { name: v["video.inspector.volume"] });
    fireEvent.change(volume, { target: { value: "120" } });
    fireEvent.change(volume, { target: { value: "150" } });
    expect(run).not.toHaveBeenCalled();
    expect((volume as HTMLInputElement).value).toBe("150");
    fireEvent.pointerUp(volume);
    expect(run).toHaveBeenCalledOnce();
    const p = session().history!.project;
    const clip = findClip(p.tracks, p.tracks.main.clips[0]!.id)!.clip as VideoClip;
    expect(clip.volume).toBe(1.5);
  });

  it("shows no text field for a video clip", async () => {
    mockEngines({});
    renderEditor();
    await screen.findByRole("button", { name: v["video.addText"] });
    select(clipOf("video"));
    expect(inspector().getByRole("switch", { name: v["video.inspector.mute"] })).toBeTruthy();
    expect(inspector().queryByRole("textbox")).toBeNull();
    expect(inspector().queryByLabelText(v["video.inspector.color"])).toBeNull();
  });

  it("asks for one clip when several are selected", async () => {
    mockEngines({});
    const { user } = renderEditor();
    await user.click(await screen.findByRole("button", { name: v["video.addText"] }));
    select(clipOf("video"));
    expect(inspector().queryByText(v["video.inspector.empty"])).toBeNull();
    select(clipOf("text"), true);
    expect(inspector().getByText(v["video.inspector.empty"])).toBeTruthy();
  });
});
