import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../contract/byte-source";
import type { ByteSource, FileRef } from "../contract/byte-source";
import { ViewerError } from "../contract/errors";
import type { ViewKind } from "../contract/formats";
import { DEFAULT_LIMITS } from "../contract/limits";
import { load } from "./load";

const L = DEFAULT_LIMITS;
const enc = (s: string) => bytesSource(new TextEncoder().encode(s));
const ctl = () => new AbortController().signal;
const sized = (size: number): ByteSource => ({ size, read: vi.fn<ByteSource["read"]>() });
const spy = () => vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");

afterEach(() => vi.restoreAllMocks());

describe("load", () => {
  it("returns text for a text file without an object URL", async () => {
    const s = spy();
    const r = await load("text", { name: "a.txt", source: enc("héllo 你好") }, ctl(), L);
    expect(r.text).toBe("héllo 你好");
    expect(r.url).toBeNull();
    expect(s).not.toHaveBeenCalled();
  });

  it("returns text for markdown and excalidraw", async () => {
    spy();
    const md = await load("markdown", { name: "a.md", source: enc("# hi") }, ctl(), L);
    const ex = await load("excalidraw", { name: "a.excalidraw", source: enc("{}") }, ctl(), L);
    expect(md.text).toBe("# hi");
    expect(ex.text).toBe("{}");
  });

  it("makes an object URL for an image", async () => {
    const s = spy();
    const r = await load("image", { name: "a.png", source: enc("x") }, ctl(), L);
    expect(r.url).toBe("blob:x");
    expect(r.text).toBeNull();
    expect((s.mock.calls[0]![0] as Blob).type).toBe("image/png");
  });

  it("types an extensionless-mime svg as image/svg+xml", async () => {
    const s = spy();
    await load("image", { name: "LOGO.SVG", source: enc("<svg/>") }, ctl(), L);
    expect((s.mock.calls[0]![0] as Blob).type).toBe("image/svg+xml");
  });

  it("forces application/pdf for pdf", async () => {
    const s = spy();
    const file: FileRef = { name: "a.pdf", mime: "application/octet-stream", source: enc("x") };
    await load("pdf", file, ctl(), L);
    expect((s.mock.calls[0]![0] as Blob).type).toBe("application/pdf");
  });

  it("wraps a plain read failure as read_failed", async () => {
    const source: ByteSource = { size: 1, read: () => Promise.reject(new Error("404")) };
    const err = await load("text", { name: "a.txt", source }, ctl(), L).catch((e) => e);
    expect(err).toBeInstanceOf(ViewerError);
    expect(err.code).toBe("read_failed");
  });

  it("rethrows a ViewerError as is", async () => {
    const e = new ViewerError("decode_failed");
    const source: ByteSource = { size: 1, read: () => Promise.reject(e) };
    await expect(load("text", { name: "a.txt", source }, ctl(), L)).rejects.toBe(e);
  });

  it("rejects when aborted before start", async () => {
    const s = spy();
    const c = new AbortController();
    c.abort();
    await expect(
      load("image", { name: "a.png", source: enc("x") }, c.signal, L),
    ).rejects.toBeDefined();
    expect(s).not.toHaveBeenCalled();
  });

  it.each([
    ["image", "a.png", L.previewBytes],
    ["text", "a.txt", L.textBytes],
    ["markdown", "a.md", L.docBytes],
  ] as const)("rejects %s over its limit without reading", async (view, name, limit) => {
    const source = sized(limit + 1);
    const err = await load(view, { name, source }, ctl(), L).catch((e) => e);
    expect(err).toBeInstanceOf(ViewerError);
    expect(err.code).toBe("too_large");
    expect(source.read).not.toHaveBeenCalled();
  });

  it("does not reject an image exactly at the limit", async () => {
    const source: ByteSource = {
      size: L.previewBytes,
      read: vi.fn<ByteSource["read"]>().mockResolvedValue(new Uint8Array(L.previewBytes)),
    };
    spy();
    // size check only: the read may fail or succeed, but never as too_large
    const err = await load("image", { name: "a.png", source }, ctl(), L).catch((e) => e);
    expect(err?.code).not.toBe("too_large");
  });

  it("comp: no size check, no read, no object URL", async () => {
    const s = spy();
    const source = sized(L.projectBytes * 2);
    const r = await load("comp" as ViewKind, { name: "a.comp.zip", source }, ctl(), {
      ...L,
      projectBytes: 10,
    });
    expect(source.read).not.toHaveBeenCalled();
    expect(s).not.toHaveBeenCalled();
    expect(r.url).toBeNull();
    expect(r.text).toBeNull();
    expect(r.blob.size).toBe(0);
  });
});
