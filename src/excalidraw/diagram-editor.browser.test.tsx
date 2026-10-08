// oxlint-disable-next-line no-restricted-imports -- test only: hosts import tokens.css before styles.css
import "@anyknown/ui/tokens.css";
import "../styles.css";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import diagram from "../../test/fixtures/diagram.excalidraw?raw";
import type { Theme } from "../contract/props";
import { ViewerRoot } from "../primitives/root";
import DiagramEditor from "./diagram-editor";

afterEach(cleanup);

const WAIT = { timeout: 10_000 };

type SaveFn = (json: string) => Promise<void>;

function setup(save: SaveFn = async () => {}, theme?: Theme) {
  const onSave = vi.fn<SaveFn>(save);
  const onClose = vi.fn<() => void>();
  const onDirtyChange = vi.fn<(dirty: boolean) => void>();
  const view = render(
    <ViewerRoot theme={theme}>
      <div style={{ height: 600 }}>
        <DiagramEditor
          json={diagram}
          onSave={onSave}
          onClose={onClose}
          onDirtyChange={onDirtyChange}
        />
      </div>
    </ViewerRoot>,
  );
  return { ...view, onSave, onClose, onDirtyChange };
}

async function ready(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(
    () => expect(container.querySelector(".excalidraw canvas.interactive")).toBeTruthy(),
    WAIT,
  );
  return container.querySelector(".excalidraw") as HTMLElement;
}

// Picks the rectangle tool with "r", then drags a new rectangle below the fixture's.
// Moves go to the canvas: Excalidraw ignores pointer events whose target is not an element.
async function drawRectangle(container: HTMLElement): Promise<void> {
  const root = await ready(container);
  fireEvent.keyDown(root, { key: "r", code: "KeyR" });
  const canvas = container.querySelector(".excalidraw canvas.interactive") as HTMLCanvasElement;
  const box = canvas.getBoundingClientRect();
  const at = (x: number, y: number, buttons = 1) => ({
    clientX: box.left + x,
    clientY: box.top + y,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons,
  });
  // Excalidraw applies pointer moves once per animation frame.
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  fireEvent.pointerDown(canvas, at(60, 360));
  fireEvent.pointerMove(canvas, at(160, 410));
  await frame();
  fireEvent.pointerMove(canvas, at(260, 460));
  await frame();
  fireEvent.pointerUp(canvas, at(260, 460, 0));
}

describe("DiagramEditor", () => {
  it("mounts Excalidraw and follows the root theme", async () => {
    const { container } = setup(undefined, "dark");
    const root = await ready(container);
    expect(root.classList.contains("theme--dark")).toBe(true);
  });

  it("hides open, export and save from the main menu", async () => {
    const { container } = setup();
    await ready(container);
    fireEvent.click(container.querySelector('[data-testid="main-menu-trigger"]') as Element);
    await waitFor(() => expect(container.querySelector(".dropdown-menu")).toBeTruthy());
    for (const id of [
      "load-button",
      "json-export-button",
      "image-export-button",
      "save-button",
      "save-as-button",
    ]) {
      expect(document.querySelector(`[data-testid="${id}"]`)).toBeNull();
    }
  });

  it("closes right away on Cancel when nothing changed", async () => {
    const { container, onClose } = setup();
    await ready(container);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard your changes?")).toBeNull();
  });

  it("reports dirty once after drawing a rectangle", async () => {
    const { container, onDirtyChange } = setup();
    await drawRectangle(container);
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));
    expect(onDirtyChange).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding changes", async () => {
    const { container, onClose, onDirtyChange } = setup();
    await drawRectangle(container);
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Discard your changes?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByText("Discard your changes?")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const lastDirty = onDirtyChange.mock.invocationCallOrder.at(-1) ?? 0;
    expect(lastDirty).toBeLessThan(onClose.mock.invocationCallOrder[0] ?? 0);
  });

  it("saves the scene with the new element", async () => {
    const { container, onSave, onClose } = setup();
    await drawRectangle(container);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const saved = JSON.parse(onSave.mock.calls[0]?.[0] ?? "{}") as {
      type: string;
      elements: unknown[];
    };
    const before = (JSON.parse(diagram) as { elements: unknown[] }).elements.length;
    expect(saved.type).toBe("excalidraw");
    expect(saved.elements.length).toBe(before + 1);
  });

  it("keeps the editor open and shows the error when saving fails", async () => {
    const { container, onClose } = setup(async () => {
      throw new Error("disk full");
    });
    await ready(container);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("disk full")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false),
    );
  });
});
