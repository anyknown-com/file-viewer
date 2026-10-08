import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Progress } from "./progress";
import { ViewerRoot } from "./root";

afterEach(cleanup);

describe("Progress", () => {
  it("exposes a determinate value", () => {
    render(
      <ViewerRoot>
        <Progress label="Export" value={0.5} />
      </ViewerRoot>,
    );
    expect(screen.getByRole("progressbar", { name: "Export" }).getAttribute("aria-valuenow")).toBe(
      "0.5",
    );
  });

  it("is indeterminate for null", () => {
    const { container } = render(
      <ViewerRoot>
        <Progress label="Export" value={null} />
      </ViewerRoot>,
    );
    expect(screen.getByRole("progressbar", { name: "Export" }).hasAttribute("aria-valuenow")).toBe(
      false,
    );
    expect(
      container.querySelector(".fv-progress-indicator")?.hasAttribute("data-indeterminate"),
    ).toBe(true);
  });
});
