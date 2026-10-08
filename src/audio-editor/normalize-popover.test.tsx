import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "../primitives/root";
import { type AudioEdit, initialEdit } from "./edit";
import { audioMessages } from "./messages";
import { NormalizePopover } from "./normalize-popover";
import { PeakBuilder, type Peaks } from "./peaks";

const en = audioMessages.en;
const RATE = 48000;

afterEach(cleanup);

function quietTone(seconds: number): Peaks {
  const frames = seconds * RATE;
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i++) data[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / RATE);
  const b = new PeakBuilder({ sampleRate: RATE, channels: 1, totalFrames: frames });
  b.push([data], frames);
  return b.finish();
}

function setup(peaks: Peaks | null) {
  const onApply = vi.fn<(next: AudioEdit) => void>();
  render(
    <ViewerRoot>
      <NormalizePopover peaks={peaks} selection={null} state={initialEdit(2)} onApply={onApply} />
    </ViewerRoot>,
  );
  const trigger = screen.getByRole<HTMLButtonElement>("button", { name: en["audio.normalize"] });
  return { onApply, trigger, user: userEvent.setup() };
}

describe("NormalizePopover", () => {
  it("normalizes the whole timeline without a selection", async () => {
    const { onApply, trigger, user } = setup(quietTone(2));
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: en["audio.apply"] }));
    const gains = onApply.mock.calls[0][0].gains;
    expect(gains).toHaveLength(1);
    expect(gains[0]).toMatchObject({ kind: "gain", start: 0, end: 2 });
    // A 0.25 peak raised to -1 dBFS is about +11 dB.
    expect(gains[0].db).toBeGreaterThan(10);
  });

  it("is disabled until the peaks are ready", () => {
    expect(setup(null).trigger.disabled).toBe(true);
  });
});
