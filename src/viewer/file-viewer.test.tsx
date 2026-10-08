import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import type { ByteSource, FileRef } from "../contract/byte-source";
import type { ViewerError } from "../contract/errors";
import { commonMessages } from "../i18n/messages";
import { bodies } from "./bodies";
import { FileViewer } from "./file-viewer";
import { viewerMessages } from "./messages";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const enc = (s: string) => bytesSource(new TextEncoder().encode(s));
const create = () => vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
const revoke = () => vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
const noop = () => {};

describe("FileViewer", () => {
  it("shows loading, then text", async () => {
    const { container } = render(<FileViewer file={{ name: "a.txt", source: enc("hello") }} />);
    expect(screen.getByRole("status", { name: "Loading…" })).toBeTruthy();
    await waitFor(() => expect(container.querySelector("pre")!.textContent).toBe("hello"));
  });

  it("shows an image and revokes its url on unmount", async () => {
    create();
    const rv = revoke();
    const { container, unmount } = render(
      <FileViewer file={{ name: "a.png", source: enc("x") }} />,
    );
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:x");
    expect(img.alt).toBe("a.png");
    unmount();
    expect(rv).toHaveBeenCalledWith("blob:x");
  });

  it("pdf: no sandbox and blob typed application/pdf", async () => {
    const c = create();
    const { container } = render(<FileViewer file={{ name: "doc.pdf", source: enc("x") }} />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
    expect(container.querySelector("iframe")!.hasAttribute("sandbox")).toBe(false);
    expect((c.mock.calls[0]![0] as Blob).type).toBe("application/pdf");
  });

  it("unsupported: no read, no onError", () => {
    const source = enc("x");
    const read = vi.spyOn(source, "read");
    const onError = vi.fn<(e: ViewerError) => void>();
    render(<FileViewer file={{ name: "a.zip", source }} onError={onError} />);
    expect(screen.getByText(commonMessages.en["error.unsupported"])).toBeTruthy();
    expect(screen.getByText(viewerMessages.en["viewer.downloadHint"])).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("too large: no read, no onError", () => {
    const source: ByteSource = { size: 2 * 1024 * 1024, read: vi.fn<ByteSource["read"]>() };
    const onError = vi.fn<(e: ViewerError) => void>();
    render(<FileViewer file={{ name: "a.txt", source }} onError={onError} />);
    expect(screen.getByText(commonMessages.en["error.too_large"])).toBeTruthy();
    expect(source.read).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("read failure reports once, then recovers on a new source", async () => {
    create();
    const bad: ByteSource = { size: 1, read: () => Promise.reject(new Error("404")) };
    const onError = vi.fn<(e: ViewerError) => void>();
    const { container, rerender } = render(
      <FileViewer file={{ name: "a.pdf", source: bad }} onError={onError} />,
    );
    await waitFor(() =>
      expect(screen.getByText(commonMessages.en["error.read_failed"])).toBeTruthy(),
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].code).toBe("read_failed");
    rerender(<FileViewer file={{ name: "b.pdf", source: enc("x") }} onError={onError} />);
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
  });

  it("same source in a new FileRef does not reload", async () => {
    const c = create();
    const rv = revoke();
    const source = enc("x");
    const read = vi.spyOn(source, "blob");
    const { container, rerender } = render(<FileViewer file={{ name: "a.png", source }} />);
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    rerender(<FileViewer file={{ name: "a.png", source }} />);
    expect(read).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
    expect(rv).not.toHaveBeenCalled();
  });

  it("a new inline onError each render does not reload", async () => {
    const source = enc("hello");
    const read = vi.spyOn(source, "blob");
    const file: FileRef = { name: "a.txt", source };
    const { container, rerender } = render(<FileViewer file={file} onError={() => {}} />);
    await waitFor(() => expect(container.querySelector("pre")).toBeTruthy());
    rerender(<FileViewer file={file} onError={() => {}} />);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("aborts the read on unmount while loading, without onError", async () => {
    let signal: AbortSignal | undefined;
    const source: ByteSource = {
      size: 1,
      read: (_s, _e, sig) => {
        signal = sig;
        return new Promise(noop);
      },
    };
    const onError = vi.fn<(e: ViewerError) => void>();
    const { unmount } = render(<FileViewer file={{ name: "a.txt", source }} onError={onError} />);
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal!.aborted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("uses source.blob() when present", async () => {
    const source: ByteSource = {
      size: 5,
      read: vi.fn<ByteSource["read"]>(),
      blob: () => Promise.resolve(new Blob(["hello"])),
    };
    const { container } = render(<FileViewer file={{ name: "a.txt", source }} />);
    await waitFor(() => expect(container.querySelector("pre")!.textContent).toBe("hello"));
    expect(source.read).not.toHaveBeenCalled();
  });

  it("localises and overrides the loading label", () => {
    const file = { name: "a.txt", source: enc("x") };
    const zh = render(<FileViewer file={file} locale="zh-TW" />);
    expect(screen.getByRole("status", { name: "載入中…" })).toBeTruthy();
    zh.unmount();
    render(<FileViewer file={file} messages={{ "viewer.loading": "Decrypting…" }} />);
    expect(screen.getByRole("status", { name: "Decrypting…" })).toBeTruthy();
  });

  it("theme dark sets root class and data-theme", () => {
    const { container } = render(
      <FileViewer file={{ name: "a.txt", source: enc("x") }} theme="dark" />,
    );
    const root = container.firstElementChild!;
    expect(root.classList.contains("fv-root")).toBe(true);
    expect(root.classList.contains("fv-viewer")).toBe(true);
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("renders markdown", async () => {
    // Load the lazy body first: its cold import alone can outlast waitFor's 1s on a busy CI runner.
    await import("./markdown-body");
    const { container } = render(<FileViewer file={{ name: "notes.md", source: enc("# hi") }} />);
    await waitFor(() => expect(container.querySelector("h1")!.textContent).toBe("hi"));
  });

  it("a throwing body becomes render_failed", async () => {
    const orig = bodies.text;
    const Thrower = (): ReactNode => {
      throw new Error("boom");
    };
    bodies.text = Thrower;
    vi.spyOn(console, "error").mockImplementation(noop);
    const onError = vi.fn<(e: ViewerError) => void>();
    try {
      render(<FileViewer file={{ name: "a.txt", source: enc("x") }} onError={onError} />);
      await waitFor(() =>
        expect(screen.getByText(commonMessages.en["error.render_failed"])).toBeTruthy(),
      );
      expect(onError.mock.calls[0]![0].code).toBe("render_failed");
    } finally {
      bodies.text = orig;
    }
  });
});
