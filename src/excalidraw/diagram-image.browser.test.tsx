import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import diagram from "../../test/fixtures/diagram.excalidraw?raw";
import DiagramImage from "./diagram-image";

const props = { alt: "Hello", loading: <span>loading</span>, broken: <span>broken</span> };

function img(container: HTMLElement): HTMLImageElement {
  const el = container.querySelector("img");
  if (!el) throw new Error("no img");
  return el;
}

async function blobSrc(container: HTMLElement): Promise<string> {
  await waitFor(() => expect(img(container).getAttribute("src") ?? "").toMatch(/^blob:/), {
    timeout: 10_000,
  });
  return img(container).src;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DiagramImage", () => {
  it("renders the fixture as a blob: image with its alt", async () => {
    const { container } = render(<DiagramImage json={diagram} theme="light" {...props} />);
    expect(await blobSrc(container)).toMatch(/^blob:/);
    expect(img(container).alt).toBe("Hello");
  });

  it("swaps the src and revokes the old url when the theme changes", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { container, rerender } = render(
      <DiagramImage json={diagram} theme="light" {...props} />,
    );
    const light = await blobSrc(container);
    rerender(<DiagramImage json={diagram} theme="dark" {...props} />);
    await waitFor(() => expect(img(container).src).not.toBe(light), { timeout: 10_000 });
    expect(img(container).src).toMatch(/^blob:/);
    expect(revoke).toHaveBeenCalledWith(light);
  });

  it("revokes every url it created on unmount", async () => {
    const create = vi.spyOn(URL, "createObjectURL");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { container, unmount } = render(<DiagramImage json={diagram} theme="light" {...props} />);
    await blobSrc(container);
    unmount();
    expect(create.mock.calls.length).toBeGreaterThan(0);
    expect(revoke.mock.calls.length).toBe(create.mock.calls.length);
  });

  it("shows broken for bad json", async () => {
    const { findByText } = render(<DiagramImage json="{not json" theme="light" {...props} />);
    expect(await findByText("broken")).toBeTruthy();
  });
});
