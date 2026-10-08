import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { lazy, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import type { EditorProps } from "../contract/editor";
import type { ViewerError } from "../contract/errors";
import type { SaveHandler } from "../contract/save";
import { commonMessages } from "../i18n/messages";
import { ViewerRoot } from "../primitives/root";
import { EditPane } from "./edit-pane";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const noop = (): void => {};
const Thrower = (): never => {
  throw new Error("boom");
};
const Field = () => <input aria-label="field" />;

function setup(Editor: ComponentType<EditorProps>) {
  const report = vi.fn<(e: ViewerError) => void>();
  const onClose = vi.fn<() => void>();
  const editorProps: EditorProps = {
    file: { name: "d.excalidraw", source: bytesSource(new Uint8Array(1)) },
    onSave: vi.fn<SaveHandler>(),
    onClose,
  };
  const spy = vi.fn<() => void>();
  // The host's own handler sits on an element above the React root.
  const host = document.createElement("div");
  const container = document.createElement("div");
  host.addEventListener("keydown", spy);
  host.append(container);
  document.body.append(host);
  render(
    <ViewerRoot locale="en">
      <EditPane Editor={Editor} editorProps={editorProps} report={report} />
    </ViewerRoot>,
    { container },
  );
  return { report, onClose, editorProps, spy };
}

describe("EditPane", () => {
  it("renders a sync editor with the given props", () => {
    const Editor = vi.fn<(p: EditorProps) => React.JSX.Element>(() => <p>editing</p>);
    const r = setup(Editor);
    expect(screen.getByText("editing")).toBeTruthy();
    expect(Editor.mock.calls[0][0]).toEqual(r.editorProps);
  });

  it("shows loading while the chunk loads", () => {
    setup(lazy(() => new Promise<{ default: ComponentType<EditorProps> }>(noop)));
    expect(screen.getByRole("status", { name: "Loading…" })).toBeTruthy();
  });

  it.each([
    ["the chunk fails", lazy(() => Promise.reject(new Error("chunk")))],
    ["the editor throws", Thrower],
  ])("shows render_failed and Back when %s", async (_, Editor) => {
    vi.spyOn(console, "error").mockImplementation(noop);
    const r = setup(Editor);
    expect(await screen.findByText(commonMessages.en["error.render_failed"])).toBeTruthy();
    expect(r.report).toHaveBeenCalledOnce();
    expect(r.report.mock.calls[0][0].code).toBe("render_failed");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(r.onClose).toHaveBeenCalledOnce();
  });

  it("keeps key presses away from the host", () => {
    const r = setup(Field);
    const input = screen.getByRole("textbox", { name: "field" });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(r.spy).not.toHaveBeenCalled();
  });
});
