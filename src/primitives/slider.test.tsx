import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "./root";
import { Slider } from "./slider";

afterEach(cleanup);

function setup(disabled?: boolean) {
  const onValueChange = vi.fn<(v: number) => void>();
  render(
    <ViewerRoot>
      <Slider
        label="Volume"
        value={5}
        min={0}
        max={10}
        step={1}
        disabled={disabled}
        onValueChange={onValueChange}
      />
    </ViewerRoot>,
  );
  return { onValueChange, user: userEvent.setup() };
}

describe("Slider", () => {
  it("exposes a labelled slider with its value", () => {
    setup();
    expect(screen.getByRole("slider", { name: "Volume" }).getAttribute("aria-valuenow")).toBe("5");
  });

  it("steps with the arrow key", async () => {
    const { user, onValueChange } = setup();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenCalledWith(6);
  });

  it("does nothing when disabled", async () => {
    const { user, onValueChange } = setup(true);
    screen.getByRole("slider", { name: "Volume" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
