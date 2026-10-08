import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "../primitives/root";
import { type AudioEdit, boundaries, initialEdit, outputDuration, type Range } from "./edit";
import { audioMessages } from "./messages";
import { Tools } from "./tools";

const en = audioMessages.en;

afterEach(cleanup);

function button(name: string) {
  return screen.getByRole<HTMLButtonElement>("button", { name });
}

function setup(selection: Range | null, playhead = 3) {
  const onApply = vi.fn<(next: AudioEdit) => void>();
  const state = initialEdit(10);
  render(
    <ViewerRoot>
      <Tools
        selection={selection}
        playhead={playhead}
        onApply={onApply}
        state={state}
        canUndo={false}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
      />
    </ViewerRoot>,
  );
  return { onApply, state, user: userEvent.setup() };
}

describe("Tools", () => {
  it("disables the range tools without a selection but not split", () => {
    setup(null);
    for (const key of [
      "audio.delete",
      "audio.keepSelection",
      "audio.fadeIn",
      "audio.fadeOut",
    ] as const) {
      expect(button(en[key]).disabled).toBe(true);
    }
    expect(button(en["audio.split"]).disabled).toBe(false);
  });

  it("splits at the playhead", async () => {
    const { onApply, state, user } = setup(null, 3);
    await user.click(button(en["audio.split"]));
    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0][0];
    expect(boundaries(next)).toHaveLength(boundaries(state).length + 1);
    expect(boundaries(next)).toContain(3);
  });

  it("deleting a selection makes the output shorter", async () => {
    const { onApply, user } = setup({ start: 2, end: 4 });
    await user.click(button(en["audio.delete"]));
    expect(outputDuration(onApply.mock.calls[0][0])).toBeCloseTo(8, 9);
  });
});
