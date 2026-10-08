import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "../primitives/root";
import { type AudioEdit, initialEdit, outputDuration, type Range } from "./edit";
import { audioMessages } from "./messages";
import { PeakBuilder, type Peaks } from "./peaks";
import { findSilence } from "./silence";
import { SilencePopover } from "./silence-popover";

const en = audioMessages.en;
const RATE = 48000;

afterEach(cleanup);

/** tone 1 s, silence 2 s, tone 1 s, silence 2 s, tone 1 s. */
function peaksWithGaps(): Peaks {
  const frames = 7 * RATE;
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / RATE;
    const silent = (t >= 1 && t < 3) || (t >= 4 && t < 6);
    data[i] = silent ? 0 : 0.5 * Math.sin(2 * Math.PI * 440 * t);
  }
  const b = new PeakBuilder({ sampleRate: RATE, channels: 1, totalFrames: frames });
  b.push([data], frames);
  return b.finish();
}

function setup(peaks: Peaks | null) {
  const onMark = vi.fn<(ranges: Range[]) => void>();
  const onApply = vi.fn<(next: AudioEdit) => void>();
  const state = initialEdit(7);
  render(
    <ViewerRoot>
      <SilencePopover peaks={peaks} state={state} onMark={onMark} onApply={onApply} />
    </ViewerRoot>,
  );
  const trigger = screen.getByRole<HTMLButtonElement>("button", {
    name: en["audio.removeSilence"],
  });
  return { onMark, onApply, state, trigger, user: userEvent.setup() };
}

const lastMark = (onMark: { mock: { calls: Range[][][] } }) => onMark.mock.calls.at(-1)?.[0];

describe("SilencePopover", () => {
  it("marks the silent ranges when opened", async () => {
    const { onMark, trigger, user } = setup(peaksWithGaps());
    await user.click(trigger);
    expect(lastMark(onMark)).toHaveLength(2);
    expect(await screen.findByText("2 silent ranges")).toBeTruthy();
  });

  it("deletes them all in one apply", async () => {
    const { onApply, trigger, user } = setup(peaksWithGaps());
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: en["audio.silenceRemove"] }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(outputDuration(onApply.mock.calls[0][0])).toBeCloseTo(7 - 2 * (2 - 0.4), 1);
  });

  it("clears the marks when closed with Escape", async () => {
    const { onMark, trigger, user } = setup(peaksWithGaps());
    await user.click(trigger);
    await screen.findByText("2 silent ranges");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(lastMark(onMark)).toEqual([]));
  });

  it("keeps its settings across close and reopen", async () => {
    const peaks = peaksWithGaps();
    const { onMark, state, trigger, user } = setup(peaks);
    await user.click(trigger);
    screen.getByRole("slider", { name: en["audio.silenceThreshold"] }).focus();
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(lastMark(onMark)).toEqual([]));
    await waitFor(() => expect(screen.queryByRole("slider")).toBeNull());
    await user.click(trigger);
    const slider = await screen.findByRole("slider", { name: en["audio.silenceThreshold"] });
    expect(slider.getAttribute("aria-valuenow")).toBe("-49");
    expect(lastMark(onMark)).toEqual(
      findSilence(peaks, state, { thresholdDb: -49, minSeconds: 1 }),
    );
  });

  it("is disabled until the peaks are ready", () => {
    expect(setup(null).trigger.disabled).toBe(true);
  });
});
