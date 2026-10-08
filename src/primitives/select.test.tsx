import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "./root";
import { Select } from "./select";

afterEach(cleanup);

describe("Select", () => {
  it("shows the label, lists grouped options and reports a pick", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(v: string) => void>();
    render(
      <ViewerRoot>
        <Select
          label="Mode"
          value="a"
          groups={[
            [
              { value: "a", label: "Alpha" },
              { value: "b", label: "Beta" },
            ],
            [{ value: "c", label: "Gamma" }],
          ]}
          onChange={onChange}
        />
      </ViewerRoot>,
    );
    const trigger = screen.getByRole("combobox", { name: "Mode" });
    expect(trigger.textContent).toContain("Alpha");
    await user.click(trigger);
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]?.closest(".fv-portal")).not.toBeNull();
    expect(document.querySelectorAll(".fv-select-separator")).toHaveLength(1);
    await user.click(screen.getByRole("option", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
