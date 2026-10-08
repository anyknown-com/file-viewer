import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import doc from "../../test/fixtures/doc-with-diagrams.md?raw";
import { findFences } from "./fences";
import { MarkdownView } from "./markdown-view";

afterEach(cleanup);

describe("MarkdownView", () => {
  it("renders the fixture structure", () => {
    const { container } = render(<MarkdownView source={doc} />);
    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("table")).toBeTruthy();
    const boxes = [...container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    expect(container.querySelector("pre code.language-ts")).toBeTruthy();
  });

  it("falls back to raw JSON blocks without renderDiagram", () => {
    const { container } = render(<MarkdownView source={doc} />);
    const raw = [...container.querySelectorAll(".fv-md-diagram-raw")].map((e) => e.textContent);
    expect(raw).toEqual(findFences(doc).map((f) => f.json));
    expect(raw).toHaveLength(3);
  });

  it("uses renderDiagram", () => {
    render(
      <MarkdownView source={doc} renderDiagram={(f) => <div data-testid="d">{f.index}</div>} />,
    );
    expect(screen.getAllByTestId("d").map((e) => e.textContent)).toEqual(["0", "1", "2"]);
  });

  it("shows alt text for an external image without a resolver", () => {
    render(<MarkdownView source={doc} />);
    expect(screen.getByText("[Image: 流量圖]")).toBeTruthy();
  });

  it("drops raw html", () => {
    const { container } = render(
      <MarkdownView source={"<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\ntext"} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("strips javascript: links to text", () => {
    const { container } = render(<MarkdownView source="[x](javascript:alert(1))" />);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("x").tagName).toBe("SPAN");
  });

  it("opens normal links safely", () => {
    const { container } = render(<MarkdownView source="[x](https://a.example)" />);
    const a = container.querySelector("a");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps data: image src for the resolver", () => {
    const { container } = render(
      <MarkdownView source="![a](data:image/png;base64,AAAA)" resolveImage={(src) => src} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")?.startsWith("data:")).toBe(true);
  });

  it("renders only one anchor for a linked image", () => {
    const { container } = render(
      <MarkdownView
        source="[![a](https://x.example/a.png)](https://y.example)"
        resolveImage={() => ({ link: "https://x.example/a.png" })}
      />,
    );
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });
});
