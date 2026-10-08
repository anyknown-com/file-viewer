import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "./root";
import { Switch } from "./switch";

afterEach(cleanup);

describe("Switch", () => {
  it("reflects and toggles its state", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn<(c: boolean) => void>();
    render(
      <ViewerRoot>
        <Switch label="Fast" checked={false} onCheckedChange={onCheckedChange} />
      </ViewerRoot>,
    );
    const s = screen.getByRole("switch", { name: "Fast" });
    expect(s.getAttribute("aria-checked")).toBe("false");
    await user.click(s);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("ignores clicks when disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn<(c: boolean) => void>();
    render(
      <ViewerRoot>
        <Switch label="Fast" checked disabled onCheckedChange={onCheckedChange} />
      </ViewerRoot>,
    );
    await user.click(screen.getByRole("switch", { name: "Fast" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
