import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "../primitives/root";
import { type AudioEdit, initialEdit, type Range } from "./edit";
import { audioMessages } from "./messages";
import { VolumePopover } from "./volume-popover";

const en = audioMessages.en;

afterEach(cleanup);

function setup(selection: Range | null) {
  const onApply = vi.fn<(next: AudioEdit) => void>();
  render(
    <ViewerRoot>
      <VolumePopover selection={selection} state={initialEdit(10)} onApply={onApply} />
    </ViewerRoot>,
  );
  const trigger = screen.getByRole<HTMLButtonElement>("button", { name: en["audio.volume"] });
  return { onApply, trigger, user: userEvent.setup() };
}

describe("VolumePopover", () => {
  it("is disabled without a selection", () => {
    expect(setup(null).trigger.disabled).toBe(true);
  });

  it("applies a gain over the selection", async () => {
    const { onApply, trigger, user } = setup({ start: 2, end: 4 });
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: en["audio.apply"] }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].gains).toContainEqual(
      expect.objectContaining({ kind: "gain", start: 2, end: 4, db: 0 }),
    );
  });
});
