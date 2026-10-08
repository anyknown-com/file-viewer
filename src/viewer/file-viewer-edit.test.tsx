import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource, type ByteSource, type FileRef } from "../contract/byte-source";
import type { EditorProps } from "../contract/editor";
import type { SaveHandler, SaveRequest } from "../contract/save";
import { commonMessages } from "../i18n/messages";
import { FileViewer } from "./file-viewer";

const mounted = vi.fn<() => void>();

function FakeEditor(props: EditorProps): React.JSX.Element {
  useState(mounted);
  return (
    <div>
      <p>{props.file.name}</p>
      <button type="button" onClick={() => void props.onSave(req)}>
        fake-save
      </button>
      <button type="button" onClick={() => props.onDirtyChange?.(true)}>
        fake-dirty
      </button>
      <button type="button" onClick={props.onClose}>
        fake-close
      </button>
      <input aria-label="field" />
    </div>
  );
}

vi.mock("./editors", () => ({ editors: { excalidraw: FakeEditor, video: FakeEditor } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const req: SaveRequest = {
  blob: new Blob(["v2"]),
  mime: "application/json",
  ext: "excalidraw",
  mode: "replace",
  suggestedName: "d.excalidraw",
};
const enc = (s: string) => bytesSource(new TextEncoder().encode(s));
const doc = (s = "v1"): FileRef => ({ name: "d.excalidraw", source: enc(s) });
const editButton = () => screen.queryByRole("button", { name: "Edit" });
const pre = (c: HTMLElement) => c.querySelector("pre");

function setup(file: FileRef = doc()) {
  const onSave = vi.fn<SaveHandler>(async () => {});
  const onEditingChange = vi.fn<(editing: boolean) => void>();
  const onDirtyChange = vi.fn<(dirty: boolean) => void>();
  const ui = (f: FileRef) => (
    <FileViewer
      file={f}
      onSave={onSave}
      onEditingChange={onEditingChange}
      onDirtyChange={onDirtyChange}
    />
  );
  const r = render(ui(file));
  return { ...r, ui, onSave, onEditingChange, onDirtyChange };
}

async function openEditor(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(pre(container)).toBeTruthy());
  fireEvent.click(editButton()!);
}

describe("FileViewer edit mode", () => {
  it("has no Edit button without onSave", async () => {
    const { container } = render(<FileViewer file={doc()} />);
    await waitFor(() => expect(pre(container)).toBeTruthy());
    expect(editButton()).toBeNull();
  });

  it("has an Edit button with onSave", () => {
    setup();
    expect(editButton()).toBeTruthy();
  });

  it("has no Edit button for a kind with no editor registered", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    setup({ name: "a.png", source: enc("png") });
    expect(editButton()).toBeNull();
  });

  it("opens the editor in place of the viewer", async () => {
    const s = setup();
    await openEditor(s.container);
    expect(s.onEditingChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("d.excalidraw")).toBeTruthy();
    expect(pre(s.container)).toBeNull();
    expect(editButton()).toBeNull();
  });

  it("passes the editor's dirty state to the host", async () => {
    const s = setup();
    await openEditor(s.container);
    fireEvent.click(screen.getByRole("button", { name: "fake-dirty" }));
    expect(s.onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("goes back to the viewer on close", async () => {
    const s = setup();
    await openEditor(s.container);
    fireEvent.click(screen.getByRole("button", { name: "fake-close" }));
    expect(s.onEditingChange.mock.calls.at(-1)).toEqual([false]);
    expect(s.onDirtyChange.mock.calls.at(-1)).toEqual([false]);
    expect(s.onEditingChange.mock.invocationCallOrder.at(-1)).toBeLessThan(
      s.onDirtyChange.mock.invocationCallOrder.at(-1)!,
    );
    await waitFor(() => expect(pre(s.container)?.textContent).toBe("v1"));
    expect(editButton()).toBeTruthy();
  });

  it("keeps the editor mounted when the host swaps in the saved file", async () => {
    const s = setup();
    s.onSave.mockImplementation(async () => {
      s.rerender(s.ui(doc("v2")));
    });
    await openEditor(s.container);
    fireEvent.click(screen.getByRole("button", { name: "fake-save" }));
    expect(s.onSave).toHaveBeenCalledWith(req);
    expect(mounted).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "fake-close" }));
    await waitFor(() => expect(pre(s.container)?.textContent).toBe("v2"));
  });

  it("offers Edit for a video too large to preview", () => {
    const MiB = 1024 * 1024;
    setup({ name: "clip.mp4", source: { size: 100 * MiB, read: vi.fn<ByteSource["read"]>() } });
    expect(screen.getByText(commonMessages.en["error.too_large"])).toBeTruthy();
    fireEvent.click(editButton()!);
    expect(screen.getByText("clip.mp4")).toBeTruthy();
  });

  it("keeps key presses in the editor away from the host", async () => {
    const spy = vi.fn<() => void>();
    const host = document.createElement("div");
    const container = document.createElement("div");
    host.addEventListener("keydown", spy);
    host.append(container);
    document.body.append(host);
    const onSave = vi.fn<SaveHandler>();
    render(<FileViewer file={doc()} onSave={onSave} />, { container });
    await openEditor(container);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "field" }), { key: "ArrowLeft" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("never calls onSave by itself", async () => {
    const s = setup();
    await waitFor(() => expect(pre(s.container)).toBeTruthy());
    expect(s.onSave).not.toHaveBeenCalled();
    fireEvent.click(editButton()!);
    expect(s.onSave).not.toHaveBeenCalled();
  });
});
