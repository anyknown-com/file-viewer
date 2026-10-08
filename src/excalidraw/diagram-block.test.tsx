import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import diagram from "../../test/fixtures/diagram.excalidraw?raw";
import { ViewerRoot } from "../primitives/root";
import { DiagramBlock } from "./diagram-block";

vi.mock("./diagram-image", () => ({ default: () => <img alt="mock" /> }));

afterEach(cleanup);

describe("DiagramBlock", () => {
  it("shows broken json as a card with the source", () => {
    const { container } = render(
      <ViewerRoot>
        <DiagramBlock json="{not json" onEdit={vi.fn<() => void>()} />
      </ViewerRoot>,
    );
    const card = container.querySelector(".fv-diagram-broken");
    expect(card?.textContent).toContain("This diagram can't be read");
    expect(card?.querySelector("pre")?.textContent).toBe("{not json");
    expect(container.querySelector("button")).toBeNull();
  });

  it("wraps a valid diagram in a figure without onEdit", async () => {
    const { container } = render(
      <ViewerRoot>
        <DiagramBlock json={diagram} />
      </ViewerRoot>,
    );
    await screen.findByAltText("mock");
    expect(container.querySelector("figure.fv-diagram")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("is a button that calls onEdit", async () => {
    const onEdit = vi.fn<() => void>();
    render(
      <ViewerRoot>
        <DiagramBlock json={diagram} onEdit={onEdit} />
      </ViewerRoot>,
    );
    await screen.findByAltText("mock");
    const button = screen.getByRole("button", { name: "Edit diagram" });
    expect(button.classList.contains("fv-diagram")).toBe(true);
    fireEvent.click(button);
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
