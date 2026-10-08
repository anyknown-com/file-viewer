import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Popover } from "./popover";
import { ViewerRoot } from "./root";

afterEach(cleanup);

describe("Popover", () => {
  it("opens into the portal and closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <ViewerRoot>
        <Popover label="Volume" trigger={<Button>Open</Button>}>
          content
        </Popover>
      </ViewerRoot>,
    );
    await user.click(screen.getByRole("button", { name: "Volume" }));
    const c = await screen.findByText("content");
    expect(c.closest(".fv-portal")).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("content")).toBeNull());
  });

  it("reports open and close", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(o: boolean) => void>();
    render(
      <ViewerRoot>
        <Popover label="Volume" trigger={<Button>Open</Button>} onOpenChange={onOpenChange}>
          content
        </Popover>
      </ViewerRoot>,
    );
    await user.click(screen.getByRole("button", { name: "Volume" }));
    await screen.findByText("content");
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledTimes(2));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
