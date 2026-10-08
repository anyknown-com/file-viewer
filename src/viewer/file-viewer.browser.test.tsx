// oxlint-disable-next-line no-restricted-imports -- test only: hosts import tokens.css before styles.css
import "@anyknown/ui/tokens.css";
import "../styles.css";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import type { ViewerError } from "../contract/errors";
import { commonMessages } from "../i18n/messages";
import { FileViewer } from "./file-viewer";

afterEach(cleanup);

const enc = (s: string) => new TextEncoder().encode(s);
const src = (bytes: Uint8Array<ArrayBuffer>) => bytesSource(bytes);

const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const MIN_PDF =
  "%PDF-1.4\n" +
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
  "trailer<</Root 1 0 R/Size 4>>\n%%EOF\n";

function pollFor<T>(fn: () => T | null | undefined, timeout = 5000): Promise<T> {
  return expect
    .poll(fn, { timeout })
    .toBeTruthy()
    .then(() => fn() as T);
}

describe("FileViewer in a real browser", () => {
  it("decodes a 1x1 PNG", async () => {
    const { container } = render(<FileViewer file={{ name: "a.png", source: src(PNG_1X1) }} />);
    const img = await pollFor(() => container.querySelector("img"));
    await expect.poll(() => img.naturalWidth).toBe(1);
  });

  it("reports decode_failed for a broken PNG", async () => {
    const bytes = new Uint8Array(64);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.fill(0x41, 8);
    const onError = vi.fn<(e: ViewerError) => void>();
    const { container } = render(
      <FileViewer file={{ name: "bad.png", source: src(bytes) }} onError={onError} />,
    );
    await expect
      .poll(() => container.textContent, { timeout: 5000 })
      .toContain(commonMessages.en["error.decode_failed"]);
    expect(onError.mock.calls[0]![0].code).toBe("decode_failed");
  });

  it("draws an svg without running its script", async () => {
    const svg = enc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>window.__fvSvg=1</script><rect width="10" height="10"/></svg>',
    );
    const { container } = render(<FileViewer file={{ name: "logo.svg", source: src(svg) }} />);
    const img = await pollFor(() => container.querySelector("img"));
    await expect.poll(() => img.naturalWidth).toBe(10);
    expect((window as unknown as { __fvSvg?: number }).__fvSvg).toBeUndefined();
  });

  it("shows UTF-8 text exactly", async () => {
    const { container } = render(
      <FileViewer file={{ name: "你好.txt", source: src(enc("你好，世界")) }} />,
    );
    const pre = await pollFor(() => container.querySelector("pre"));
    expect(pre.textContent).toBe("你好，世界");
  });

  it("fails cleanly on a junk mp4", async () => {
    const junk = new Uint8Array(1024).fill(7);
    const { container } = render(<FileViewer file={{ name: "junk.mp4", source: src(junk) }} />);
    await expect
      .poll(
        () => {
          const t = container.textContent ?? "";
          return (
            t.includes(commonMessages.en["error.decode_failed"]) ||
            t.includes(commonMessages.en["error.codec_unsupported"])
          );
        },
        { timeout: 5000 },
      )
      .toBe(true);
  });

  it("gives the pdf iframe a blob url and no sandbox", async () => {
    const { container } = render(
      <FileViewer file={{ name: "doc.pdf", source: src(enc(MIN_PDF)) }} />,
    );
    const frame = await pollFor(() => container.querySelector("iframe"));
    expect(frame.getAttribute("src")?.startsWith("blob:")).toBe(true);
    expect(frame.hasAttribute("sandbox")).toBe(false);
  });
});
