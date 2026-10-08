import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import doc from "../../test/fixtures/doc-with-diagrams.md?raw";
import { blobSource } from "../contract/byte-source";
import type { FileViewerProps } from "../contract/props";
import type { SaveRequest } from "../contract/save";
import type { DiagramEditorProps } from "../excalidraw/diagram-editor";
import { findFences } from "../markdown";
import { ViewerRoot } from "../primitives/root";
import type { BodyProps } from "./bodies";
import MarkdownBody from "./markdown-body";

vi.mock("../excalidraw/diagram-image", () => ({ default: () => <img alt="mock" /> }));

const EDITED = `{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}`;
let closeOnly = false;
vi.mock("../excalidraw/diagram-editor", () => ({
  default: (p: DiagramEditorProps) => (
    <button
      type="button"
      onClick={async () => {
        if (closeOnly) return p.onClose();
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

afterEach(() => {
  cleanup();
  closeOnly = false;
});

export function bodyProps(text: string, viewer: Partial<FileViewerProps> = {}): BodyProps {
  const file = { name: "doc.md", source: blobSource(new Blob([text])) };
  return {
    file,
    loaded: { blob: new Blob([text]), url: null, text },
    fail: vi.fn<BodyProps["fail"]>(),
    viewer: { file, ...viewer },
  };
}

describe("MarkdownBody", () => {
  it("renders headings", () => {
    const { container } = render(
      <ViewerRoot>
        <MarkdownBody {...bodyProps("# Hi")} />
      </ViewerRoot>,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Hi");
  });

  it("passes resolveImage through", () => {
    const { container } = render(
      <ViewerRoot>
        <MarkdownBody
          {...bodyProps("![a](x.png)", {
            markdown: { resolveImage: () => "https://h.example/x.png" },
          })}
        />
      </ViewerRoot>,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://h.example/x.png");
  });

  it("draws excalidraw fences as diagrams", () => {
    const { container } = render(
      <ViewerRoot>
        <MarkdownBody {...bodyProps(doc)} />
      </ViewerRoot>,
    );
    expect(container.querySelectorAll(".fv-diagram")).toHaveLength(2);
    expect(container.querySelectorAll(".fv-diagram-broken")).toHaveLength(1);
  });

  it("saves an edited diagram into its own fence only", async () => {
    const onSave = vi.fn<(req: SaveRequest) => Promise<void>>().mockResolvedValue(undefined);
    const onEditingChange = vi.fn<(editing: boolean) => void>();
    const { container } = render(
      <ViewerRoot>
        <MarkdownBody {...bodyProps(doc, { onSave, onEditingChange })} />
      </ViewerRoot>,
    );
    fireEvent.click(container.querySelectorAll(".fv-diagram")[1]!);
    fireEvent.click(await screen.findByText("fake editor"));
    await waitFor(() => expect(container.querySelector(".fv-diagram")).not.toBeNull());

    const req = onSave.mock.calls[0]![0];
    expect(req).toMatchObject({
      mode: "replace",
      ext: ".md",
      mime: "text/markdown",
      suggestedName: "doc.md",
    });
    const text = await req.blob.text();
    const before = doc.split("\n");
    const after = text.split("\n");
    expect(after).toHaveLength(before.length);
    const changed = before.flatMap((line, i) => (line === after[i] ? [] : [i]));
    expect(changed).toHaveLength(1);
    expect(after[changed[0]!]).toBe(`  ${EDITED}`);
    expect(findFences(text)[0]!.json).toBe(findFences(doc)[0]!.json);
    expect(onEditingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("reports editing on and off when the editor closes without saving", async () => {
    closeOnly = true;
    const onSave = vi.fn<(req: SaveRequest) => Promise<void>>();
    const onEditingChange = vi.fn<(editing: boolean) => void>();
    const { container } = render(
      <ViewerRoot>
        <MarkdownBody {...bodyProps(doc, { onSave, onEditingChange })} />
      </ViewerRoot>,
    );
    fireEvent.click(container.querySelectorAll(".fv-diagram")[0]!);
    expect(onEditingChange.mock.calls).toEqual([[true]]);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByText("fake editor"));
    await waitFor(() => expect(container.querySelector(".fv-diagram")).not.toBeNull());
    expect(onEditingChange.mock.calls).toEqual([[true], [false]]);
    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(document.activeElement).toBe(container.querySelector('[data-fence="0"] .fv-diagram'));

    fireEvent.click(container.querySelectorAll(".fv-diagram")[0]!);
    expect(onEditingChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it("keeps the editor and the source when onSave rejects", async () => {
    const onSave = vi.fn<(req: SaveRequest) => Promise<void>>().mockRejectedValue(new Error("x"));
    const { container } = render(
      <ViewerRoot>
        <MarkdownBody {...bodyProps(doc, { onSave })} />
      </ViewerRoot>,
    );
    fireEvent.click(container.querySelectorAll(".fv-diagram")[1]!);
    fireEvent.click(await screen.findByText("fake editor"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByText("fake editor")).toBeTruthy();

    // Saving again proves the source was not replaced: the request is built from the original.
    onSave.mockResolvedValue(undefined);
    fireEvent.click(screen.getByText("fake editor"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const first = await onSave.mock.calls[0]![0].blob.text();
    const second = await onSave.mock.calls[1]![0].blob.text();
    expect(second).toBe(first);
  });

  it("does not make diagrams clickable without onSave", () => {
    const onEditingChange = vi.fn<(editing: boolean) => void>();
    const { container } = render(
      <ViewerRoot>
        <MarkdownBody {...bodyProps(doc, { onEditingChange })} />
      </ViewerRoot>,
    );
    const diagram = container.querySelector(".fv-diagram")!;
    expect(diagram.tagName).not.toBe("BUTTON");
    fireEvent.click(diagram);
    expect(onEditingChange).not.toHaveBeenCalled();
  });

  it("returns focus to the saved diagram", async () => {
    const onSave = vi.fn<(req: SaveRequest) => Promise<void>>().mockResolvedValue(undefined);
    const { container } = render(
      <ViewerRoot>
        <MarkdownBody {...bodyProps(doc, { onSave })} />
      </ViewerRoot>,
    );
    fireEvent.click(container.querySelectorAll(".fv-diagram")[1]!);
    fireEvent.click(await screen.findByText("fake editor"));
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('[data-fence="1"] .fv-diagram')),
    );
  });
});
