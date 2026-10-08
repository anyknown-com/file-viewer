import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./context-menu";
import { ViewerRoot } from "./root";

afterEach(cleanup);

function setup() {
  const a = vi.fn<() => void>();
  const b = vi.fn<() => void>();
  render(
    <ViewerRoot>
      <ContextMenu
        items={[
          { id: "a", label: "Alpha", onSelect: a },
          { id: "b", label: "Beta", onSelect: b, disabled: true },
        ]}
      >
        <div data-testid="area">area</div>
      </ContextMenu>
    </ViewerRoot>,
  );
  fireEvent.contextMenu(screen.getByTestId("area"));
  return { a, b, user: userEvent.setup() };
}

describe("ContextMenu", () => {
  it("opens into the portal", async () => {
    setup();
    const items = await screen.findAllByRole("menuitem");
    expect(items).toHaveLength(2);
    for (const i of items) expect(i.closest(".fv-portal")).not.toBeNull();
  });

  it("selects an item once", async () => {
    const { a, user } = setup();
    await user.click(await screen.findByRole("menuitem", { name: "Alpha" }));
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("ignores a disabled item", async () => {
    const { b, user } = setup();
    await user.click(await screen.findByRole("menuitem", { name: "Beta" }));
    expect(b).not.toHaveBeenCalled();
  });
});
