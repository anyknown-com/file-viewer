// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32";
import { ProjectError } from "./errors";
import { entryHeaders, writeZip } from "./zip-write";

const enc = new TextEncoder();
const entries = [
  { name: "manifest.json", data: enc.encode('{"a":1}') },
  { name: "images/圖層.png", data: new Uint8Array([1, 2, 3, 4]) },
  { name: "images/empty.bin", data: new Uint8Array() },
];

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("writeZip", () => {
  it("writes local headers that read back from offset 0", async () => {
    const zip = await bytesOf(writeZip(entries));
    const v = new DataView(zip.buffer);
    let pos = 0;
    const offsets: number[] = [];
    for (const e of entries) {
      offsets.push(pos);
      expect(v.getUint32(pos, true)).toBe(0x04034b50);
      expect(v.getUint16(pos + 6, true)).toBe(0x0800);
      expect(v.getUint16(pos + 8, true)).toBe(0);
      const crc = v.getUint32(pos + 14, true);
      const size = v.getUint32(pos + 18, true);
      expect(v.getUint32(pos + 22, true)).toBe(size);
      const nameLen = v.getUint16(pos + 26, true);
      const extraLen = v.getUint16(pos + 28, true);
      expect(extraLen).toBe(0);
      const name = new TextDecoder().decode(zip.subarray(pos + 30, pos + 30 + nameLen));
      const start = pos + 30 + nameLen;
      const data = zip.subarray(start, start + size);
      expect(name).toBe(e.name);
      expect(Array.from(data)).toEqual(Array.from(e.data));
      expect(crc).toBe(crc32(e.data));
      pos = start + size;
    }
    // central directory points at each local header
    let cpos = pos;
    for (const off of offsets) {
      expect(v.getUint32(cpos, true)).toBe(0x02014b50);
      expect(v.getUint32(cpos + 42, true)).toBe(off);
      cpos += 46 + v.getUint16(cpos + 28, true);
    }
    expect(v.getUint32(cpos, true)).toBe(0x06054b50);
    expect(v.getUint16(cpos + 10, true)).toBe(3);
  });

  it("is reproducible", async () => {
    const a = await bytesOf(writeZip(entries));
    const b = await bytesOf(writeZip(entries));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("passes unzip -t", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zipw-"));
    const file = path.join(dir, "t.zip");
    writeFileSync(file, await bytesOf(writeZip(entries)));
    expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors");
  });
});

describe("entryHeaders", () => {
  it("rejects sizes and offsets over 4 GiB", () => {
    expect(() => entryHeaders("a", 0, 2 ** 32, 0)).toThrow(ProjectError);
    expect(() => entryHeaders("a", 0, 1, 2 ** 32)).toThrow(ProjectError);
    expect(() => entryHeaders("a", 0, 2 ** 32, 0)).toThrow(/too_large/);
  });
});
