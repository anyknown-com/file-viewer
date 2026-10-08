// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProjectError } from "./errors";
import { readHeadEntries } from "./zip-head";
import { writeZip } from "./zip-write";

const enc = new TextEncoder();
const manifest = enc.encode('{"format":"com.compositor.project"}');
const preview = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
const image = new Uint8Array(1000).fill(7);
const files = [
  { name: "manifest.json", data: manifest },
  { name: "QuickLook/Preview.jpg", data: preview },
  { name: "images/A.png", data: image },
];

async function build(list = files): Promise<Uint8Array> {
  return new Uint8Array(await writeZip(list).arrayBuffer());
}

// Serves only the first `limit` bytes, like a source that was cut off.
function source(zip: Uint8Array, limit = zip.length) {
  const calls: [number, number][] = [];
  const read = async (start: number, end: number) => {
    calls.push([start, end]);
    return zip.slice(start, Math.min(end, limit));
  };
  return { read, calls };
}

const manifestEnd = 30 + "manifest.json".length + manifest.length;
const previewEnd = manifestEnd + 30 + "QuickLook/Preview.jpg".length + preview.length;

describe("readHeadEntries", () => {
  it("returns manifest and preview without touching images", async () => {
    const { read, calls } = source(await build());
    const head = await readHeadEntries(read);
    expect(Array.from(head!.manifest)).toEqual(Array.from(manifest));
    expect(Array.from(head!.preview!)).toEqual(Array.from(preview));
    expect(Math.max(...calls.map(([, end]) => end))).toBeLessThanOrEqual(previewEnd);
  });

  it("returns only the manifest when the source stops after it", async () => {
    const head = await readHeadEntries(source(await build(), manifestEnd).read);
    expect(head!.preview).toBeUndefined();
    expect(Array.from(head!.manifest)).toEqual(Array.from(manifest));
  });

  it("returns null when the manifest itself is cut off", async () => {
    expect(await readHeadEntries(source(await build(), manifestEnd - 1).read)).toBeNull();
  });

  it("returns null when the first entry is not the manifest", async () => {
    const zip = await build([files[2]!, files[0]!]);
    expect(await readHeadEntries(source(zip).read)).toBeNull();
  });

  it("returns null for a Finder zip (DEFLATE, bit 3, root folder)", async () => {
    const zip = new Uint8Array(
      readFileSync(new URL("./fixtures/ditto-sample.comp.zip", import.meta.url)),
    );
    expect(await readHeadEntries(source(zip).read)).toBeNull();
  });

  it("returns null when bit 3 is set", async () => {
    const zip = await build();
    new DataView(zip.buffer).setUint16(6, 0x0808, true);
    expect(await readHeadEntries(source(zip).read)).toBeNull();
  });

  it("rejects a manifest declared over 4 MiB", async () => {
    const zip = await build();
    const v = new DataView(zip.buffer);
    v.setUint32(18, 5 * 1024 * 1024, true);
    v.setUint32(22, 5 * 1024 * 1024, true);
    const error = await readHeadEntries(source(zip).read).catch((e: unknown) => e);
    expect((error as ProjectError).code).toBe("too_large");
  });

  it("rejects a manifest with a bad crc", async () => {
    const zip = await build();
    zip[30 + "manifest.json".length] ^= 1;
    const error = await readHeadEntries(source(zip).read).catch((e: unknown) => e);
    expect((error as ProjectError).code).toBe("not_zip");
  });

  it("drops a preview with a bad crc", async () => {
    const zip = await build();
    zip[manifestEnd + 30 + "QuickLook/Preview.jpg".length] ^= 1;
    const head = await readHeadEntries(source(zip).read);
    expect(head!.preview).toBeUndefined();
    expect(head!.manifest.length).toBe(manifest.length);
  });
});
