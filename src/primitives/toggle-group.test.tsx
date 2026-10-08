import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "./root";
import { ToggleGroup } from "./toggle-group";

afterEach(cleanup);

describe("ToggleGroup", () => {
  it("selects another option but keeps the current one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(v: string) => void>();
    render(
      <ViewerRoot>
        <ToggleGroup
          label="Mode"
          value="a"
          options={[
            { value: "a", label: "A" },
            { value: "b", label: "B" },
            { value: "c", label: "C" },
          ]}
          onChange={onChange}
        />
      </ViewerRoot>,
    );
    expect(screen.getByRole("group", { name: "Mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "A" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
    onChange.mockClear();
    await user.click(screen.getByRole("button", { name: "A" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
