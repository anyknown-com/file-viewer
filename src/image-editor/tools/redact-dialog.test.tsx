import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ViewerRoot } from "../../primitives/root";
import type { EditorApi } from "../api";
import { RedactDialog } from "./redact-dialog";

afterEach(cleanup);

it("shows no retention line by default", () => {
  render(
    <ViewerRoot locale="en">
      <RedactDialog api={{} as EditorApi} close={vi.fn<() => void>()} />
    </ViewerRoot>,
  );
  expect(screen.getByText("Redact selection")).toBeTruthy();
  expect(document.querySelector(".fv-ie-redact-retention")).toBeNull();
});

it("shows the host's retention line when messages override it", () => {
  render(
    <ViewerRoot locale="en" messages={{ "image.paint.redactRetention": "Kept 30 days." }}>
      <RedactDialog api={{} as EditorApi} close={vi.fn<() => void>()} />
    </ViewerRoot>,
  );
  expect(document.querySelector(".fv-ie-redact-retention")?.textContent).toBe("Kept 30 days.");
});

it("calls close on Cancel", () => {
  const close = vi.fn<() => void>();
  render(
    <ViewerRoot locale="en">
      <RedactDialog api={{} as EditorApi} close={close} />
    </ViewerRoot>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalled();
});
