import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RadioGroup } from "./radio-group";
import { ViewerRoot } from "./root";

afterEach(cleanup);

function setup() {
  const onChange = vi.fn<(v: string) => void>();
  render(
    <ViewerRoot>
      <RadioGroup
        label="Format"
        value="png"
        options={[
          { value: "png", label: "PNG", description: "Lossless" },
          { value: "jpg", label: "JPG" },
          { value: "gif", label: "GIF", disabled: true },
        ]}
        onChange={onChange}
      />
    </ViewerRoot>,
  );
  return { onChange, user: userEvent.setup() };
}

describe("RadioGroup", () => {
  it("shows the selected value and describes it", () => {
    setup();
    expect(screen.getByRole("radiogroup", { name: "Format" })).toBeTruthy();
    const png = screen.getByRole("radio", { name: "PNG" });
    expect(png.getAttribute("aria-checked")).toBe("true");
    expect(png.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      png.ownerDocument.getElementById(png.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Lossless");
  });

  it("reports a new value", async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole("radio", { name: "JPG" }));
    expect(onChange).toHaveBeenCalledWith("jpg");
  });

  it("ignores a disabled option", async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole("radio", { name: "GIF" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
