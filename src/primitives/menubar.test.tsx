import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menubar } from "./menubar";
import { ViewerRoot } from "./root";

afterEach(cleanup);

describe("Menubar", () => {
  it("opens a menu with shortcuts and selects an item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn<() => void>();
    render(
      <ViewerRoot>
        <Menubar
          menus={[
            {
              id: "file",
              label: "File",
              items: [{ id: "save", label: "Save", onSelect, shortcut: "⌘S" }],
            },
            {
              id: "edit",
              label: "Edit",
              items: [{ id: "undo", label: "Undo", onSelect: () => {} }],
            },
          ]}
        />
      </ViewerRoot>,
    );
    expect(screen.getByRole("menubar")).toBeTruthy();
    expect(screen.queryByText("Undo")).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "File" }));
    const save = await screen.findByRole("menuitem", { name: /Save/ });
    expect(save.textContent).toContain("⌘S");
    expect(screen.queryByText("Undo")).toBeNull();
    await user.click(save);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
