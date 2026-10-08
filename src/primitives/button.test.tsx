import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { CloseIcon } from "./glyphs";
import { ViewerRoot } from "./root";
import { Spinner } from "./spinner";

afterEach(cleanup);

describe("Button", () => {
  it("renders a secondary button by default", () => {
    render(
      <ViewerRoot>
        <Button>Go</Button>
      </ViewerRoot>,
    );
    const b = screen.getByRole("button");
    expect(b.classList.contains("fv-button")).toBe(true);
    expect(b.classList.contains("fv-button-secondary")).toBe(true);
  });

  it("applies the primary variant", () => {
    render(
      <ViewerRoot>
        <Button variant="primary">Go</Button>
      </ViewerRoot>,
    );
    expect(screen.getByRole("button").classList.contains("fv-button-primary")).toBe(true);
  });

  it("renders an icon-only button", () => {
    render(
      <ViewerRoot>
        <Button icon={<CloseIcon />} aria-label="Close" />
      </ViewerRoot>,
    );
    expect(screen.getByRole("button", { name: "Close" }).classList.contains("fv-button-icon")).toBe(
      true,
    );
  });

  it("calls onClick, but not when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn<() => void>();
    const { rerender } = render(
      <ViewerRoot>
        <Button onClick={onClick}>Go</Button>
      </ViewerRoot>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <ViewerRoot>
        <Button onClick={onClick} disabled>
          Go
        </Button>
      </ViewerRoot>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Spinner and icons", () => {
  it("exposes the spinner as a labelled status", () => {
    render(
      <ViewerRoot>
        <Spinner label="Loading" />
      </ViewerRoot>,
    );
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  it("labels an icon or hides it from assistive tech", () => {
    const { container } = render(
      <ViewerRoot>
        <CloseIcon label="Close" />
      </ViewerRoot>,
    );
    expect(screen.getByRole("img", { name: "Close" })).toBeTruthy();
    cleanup();
    const r = render(
      <ViewerRoot>
        <CloseIcon />
      </ViewerRoot>,
    );
    expect(r.container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    void container;
  });
});
