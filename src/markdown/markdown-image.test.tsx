import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageResolver } from "../contract/image-resolver";
import { ViewerRoot } from "../primitives/root";
import { InLinkContext } from "./in-link";
import { MarkdownImage } from "./markdown-image";

afterEach(cleanup);

function setup(resolveImage: ImageResolver | undefined, alt = "x", inLink = false, src = "a.png") {
  return render(
    <ViewerRoot>
      <InLinkContext value={inLink}>
        <MarkdownImage src={src} alt={alt} resolveImage={resolveImage} />
      </InLinkContext>
    </ViewerRoot>,
  );
}

describe("MarkdownImage", () => {
  it("shows alt text without a resolver", () => {
    const { container } = setup(undefined);
    expect(screen.getByText("[Image: x]")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("loads a string result", () => {
    const { container } = setup(() => "https://cdn.example/a.png");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/a.png");
  });

  it("renders a link result", () => {
    setup(() => ({ link: "https://evil.example/a.png?d=1" }));
    const a = screen.getByRole("link");
    expect(a.textContent).toBe("x (evil.example)");
    expect(a.getAttribute("title")).toBe("Open image on evil.example");
  });

  it("falls back to alt for a stripped link", () => {
    const { container } = setup(() => ({ link: "javascript:alert(1)" }));
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("[Image: x]")).toBeTruthy();
  });

  it("uses Image for empty alt", () => {
    setup(undefined, "  ");
    expect(screen.getByText("[Image: Image]")).toBeTruthy();
  });

  it("emits text only inside a link", () => {
    const { container } = setup(() => ({ link: "https://evil.example/a.png" }), "x", true);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("x (evil.example)")).toBeTruthy();
  });

  it("passes src and alt through untouched", () => {
    for (const src of ["data:image/png;base64,AAA", "blob:https://h/1", "//host/x"]) {
      const spy = vi.fn<ImageResolver>(() => null);
      setup(spy, "Alt", false, src);
      expect(spy).toHaveBeenCalledWith(src, "Alt");
      cleanup();
    }
  });
});
