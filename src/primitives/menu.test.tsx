import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Menu } from "./menu";
import { ViewerRoot } from "./root";

afterEach(cleanup);

function setup() {
  const a = vi.fn<() => void>();
  const b = vi.fn<() => void>();
  render(
    <ViewerRoot>
      <Menu
        trigger={<Button>Open</Button>}
        items={[
          { id: "a", label: "Alpha", onSelect: a },
          { id: "b", label: "Beta", onSelect: b, disabled: true },
        ]}
      />
    </ViewerRoot>,
  );
  return { a, b, user: userEvent.setup() };
}

describe("Menu", () => {
  it("opens into the portal with its items", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items).toHaveLength(2);
    for (const i of items) expect(i.closest(".fv-portal")).not.toBeNull();
  });

  it("calls onSelect once and closes", async () => {
    const { user, a } = setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("menuitem", { name: "Alpha" }));
    expect(a).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("ignores disabled items", async () => {
    const { user, b } = setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("menuitem", { name: "Beta" }));
    expect(b).not.toHaveBeenCalled();
  });
});
