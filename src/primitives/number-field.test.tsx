import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberField } from "./number-field";
import { ViewerRoot } from "./root";

afterEach(cleanup);

function setup() {
  const onChange = vi.fn<(v: number) => void>();
  const onCommit = vi.fn<(v: number) => void>();
  render(
    <ViewerRoot>
      <NumberField
        label="Opacity"
        value={10}
        min={0}
        max={100}
        onChange={onChange}
        onCommit={onCommit}
      />
    </ViewerRoot>,
  );
  return {
    onChange,
    onCommit,
    user: userEvent.setup(),
    input: screen.getByRole("textbox", { name: "Opacity" }),
  };
}

describe("NumberField", () => {
  it("shows the value and a scrub label", () => {
    const { input } = setup();
    expect((input as HTMLInputElement).value).toBe("10");
    expect(screen.getByText("Opacity").closest(".fv-number-field-scrub")).not.toBeNull();
  });

  it("commits a typed value on blur", async () => {
    const { input, user, onChange, onCommit } = setup();
    await user.clear(input);
    await user.type(input, "42");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith(42);
    expect(onCommit).toHaveBeenCalledWith(42);
  });

  it("clamps to max on blur", async () => {
    const { input, user, onCommit } = setup();
    await user.clear(input);
    await user.type(input, "500");
    await user.tab();
    expect(onCommit).toHaveBeenLastCalledWith(100);
  });
});
