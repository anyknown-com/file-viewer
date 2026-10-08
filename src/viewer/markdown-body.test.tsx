import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import doc from "../../test/fixtures/doc-with-diagrams.md?raw";
import { blobSource } from "../contract/byte-source";
import type { FileViewerProps } from "../contract/props";
import { ViewerRoot } from "../primitives/root";
import type { BodyProps } from "./bodies";
import MarkdownBody from "./markdown-body";

vi.mock("../excalidraw/diagram-image", () => ({ default: () => <img alt="mock" /> }));

afterEach(cleanup);

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
});
