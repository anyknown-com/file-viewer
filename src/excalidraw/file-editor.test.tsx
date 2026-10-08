import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import diagram from "../../test/fixtures/diagram.excalidraw?raw";
import { bytesSource, type ByteSource } from "../contract/byte-source";
import type { ViewerError } from "../contract/errors";
import type { SaveRequest } from "../contract/save";
import type { DiagramEditorProps } from "./diagram-editor";
import { ExcalidrawFileEditor } from "./file-editor";

const EDITED = `{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}`;
vi.mock("./diagram-editor", () => ({
  default: (p: DiagramEditorProps) => (
    <button
      type="button"
      data-json={p.json}
      onClick={async () => {
        try {
          await p.onSave(EDITED);
          p.onClose();
        } catch {}
      }}
    >
      fake editor
    </button>
  ),
}));

afterEach(cleanup);

function setup(source: ByteSource) {
  const onSave = vi.fn<(req: SaveRequest) => Promise<void>>().mockResolvedValue(undefined);
  const onClose = vi.fn<() => void>();
  const onError = vi.fn<(e: ViewerError) => void>();
  render(
    <ExcalidrawFileEditor
      file={{ name: "a.excalidraw", source }}
      onSave={onSave}
      onClose={onClose}
      onError={onError}
    />,
  );
  return { onSave, onClose, onError };
}

const textSource = (text: string) => bytesSource(new TextEncoder().encode(text));

describe("ExcalidrawFileEditor", () => {
  it("edits the file text and saves it as .excalidraw", async () => {
    const { onSave, onClose } = setup(textSource(diagram));
    const editor = await screen.findByText("fake editor");
    expect(editor.getAttribute("data-json")).toBe(diagram);

    fireEvent.click(editor);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const req = onSave.mock.calls[0]![0];
    expect(req).toMatchObject({
      ext: ".excalidraw",
      mime: "application/vnd.excalidraw+json",
      mode: "replace",
      suggestedName: "a.excalidraw",
    });
    expect(await req.blob.text()).toBe(EDITED);
  });

  it("shows a broken file with a Close button", async () => {
    const { onClose, onError } = setup(textSource("{not json"));
    expect(await screen.findByText("This diagram can't be read")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls.map(([e]) => e.code)).toEqual(["decode_failed"]);
  });

  it("reports read_failed when the source cannot be read", async () => {
    const source: ByteSource = { size: 10, read: () => Promise.reject(new Error("gone")) };
    const { onError } = setup(source);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0].code).toBe("read_failed");
  });
});
