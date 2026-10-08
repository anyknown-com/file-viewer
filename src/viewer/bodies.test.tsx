import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import type { FileRef } from "../contract/byte-source";
import type { ViewerError } from "../contract/errors";
import { bodies } from "./bodies";
import type { BodyProps } from "./bodies";

afterEach(cleanup);

const file: FileRef = { name: "f.bin", source: bytesSource(new Uint8Array(1)) };

function setup(Body: ComponentType<BodyProps>, loaded: Partial<BodyProps["loaded"]> = {}) {
  const fail = vi.fn<(e: ViewerError) => void>();
  const full = { blob: new Blob([]), url: "blob:x", text: null, ...loaded };
  const view = render(<Body file={file} loaded={full} fail={fail} viewer={{ file }} />);
  return { fail, container: view.container };
}

describe("bodies", () => {
  it("image: alt is the file name; error is decode_failed", () => {
    const { fail, container } = setup(bodies.image);
    const img = container.querySelector("img")!;
    expect(img.alt).toBe("f.bin");
    fireEvent.error(img);
    expect(fail.mock.calls[0]![0].code).toBe("decode_failed");
  });

  it.each(["video", "audio"] as const)("%s: attributes and error codes", (kind) => {
    const { fail, container } = setup(bodies[kind]);
    const el = container.querySelector(kind)!;
    expect(el.hasAttribute("controls")).toBe(true);
    expect(el.getAttribute("preload")).toBe("metadata");
    expect(el.hasAttribute("playsinline")).toBe(kind === "video");
    Object.defineProperty(el, "error", { value: { code: 4 }, configurable: true });
    fireEvent.error(el);
    expect(fail.mock.calls[0]![0].code).toBe("codec_unsupported");
    Object.defineProperty(el, "error", { value: { code: 3 }, configurable: true });
    fireEvent.error(el);
    expect(fail.mock.calls[1]![0].code).toBe("decode_failed");
  });

  it("pdf: no sandbox, titled, src is the url", () => {
    const { container } = setup(bodies.pdf);
    const f = container.querySelector("iframe")!;
    expect(f.hasAttribute("sandbox")).toBe(false);
    expect(f.title).toBe("f.bin");
    expect(f.getAttribute("src")).toBe("blob:x");
  });

  it("text: pre shows the text", () => {
    const { container } = setup(bodies.text, { url: null, text: "hello" });
    expect(container.querySelector("pre")!.textContent).toBe("hello");
  });

  it("covers every current kind", () => {
    expect(new Set(Object.keys(bodies))).toEqual(
      new Set(["audio", "comp", "excalidraw", "image", "markdown", "pdf", "text", "video"]),
    );
  });
});
