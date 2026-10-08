import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import diagram from "../../test/fixtures/diagram.excalidraw?raw";
import { blobSource } from "../contract/byte-source";
import type { SaveRequest } from "../contract/save";
import type { DiagramEditorProps } from "../excalidraw/diagram-editor";
import { FileViewer } from "./file-viewer";

vi.mock("../excalidraw/diagram-image", () => ({ default: () => <img alt="mock" /> }));
vi.mock("../excalidraw/diagram-editor", () => ({
  default: (p: DiagramEditorProps) => (
    <button
      type="button"
      onClick={async () => {
        await p.onSave(p.json);
        p.onClose();
      }}
    >
      fake editor
    </button>
  ),
}));

afterEach(cleanup);

describe("FileViewer with .excalidraw", () => {
  it("shows the diagram body", async () => {
    const { container } = render(
      <FileViewer file={{ name: "diagram.excalidraw", source: blobSource(new Blob([diagram])) }} />,
    );
    await waitFor(() => expect(container.querySelector(".fv-excalidraw")).not.toBeNull());
  });

  it("edits through the top bar and returns to the view after saving", async () => {
    const onSave = vi.fn<(req: SaveRequest) => Promise<void>>().mockResolvedValue(undefined);
    const { container } = render(
      <FileViewer
        file={{ name: "diagram.excalidraw", source: blobSource(new Blob([diagram])) }}
        onSave={onSave}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByText("fake editor"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.querySelector(".fv-excalidraw")).not.toBeNull());
  });
});
