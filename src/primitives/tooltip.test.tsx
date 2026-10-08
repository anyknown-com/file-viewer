import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";
import { EditIcon } from "./glyphs";
import { ViewerRoot } from "./root";
import { Tooltip } from "./tooltip";

afterEach(cleanup);

describe("Tooltip", () => {
  it("shows its content inside the portal on hover", async () => {
    const user = userEvent.setup();
    render(
      <ViewerRoot>
        <Tooltip content="Edit" delay={0}>
          <Button aria-label="e" icon={<EditIcon />} />
        </Tooltip>
      </ViewerRoot>,
    );
    await user.hover(screen.getByRole("button", { name: "e" }));
    const tip = await screen.findByText("Edit");
    expect(tip.closest(".fv-portal")).not.toBeNull();
  });
});
