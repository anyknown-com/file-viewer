// @vitest-environment node
// Fixture ditto-sample.comp.zip was made on macOS (2026-10-08) with:
//   d=$(mktemp -d) && mkdir -p "$d/sample.comp/images" \
//     && node -e "process.stdout.write(JSON.stringify({hello:'world'.repeat(200)}))" > "$d/sample.comp/manifest.json" \
//     && printf 'mask mask mask mask mask mask' > "$d/sample.comp/images/A.mask.png" \
//     && head -c 3000 /dev/urandom > "$d/sample.comp/images/A.png" \
//     && touch "$d/sample.comp/.DS_Store" && xattr -w com.example.test 1 "$d/sample.comp/manifest.json" \
//     && (cd "$d" && ditto -c -k --sequesterRsrc --keepParent sample.comp sample.comp.zip) \
//     && cp "$d/sample.comp.zip" src/comp/fixtures/ditto-sample.comp.zip
// It has a root folder, DEFLATE with data descriptors (bit 3), __MACOSX/ and .DS_Store.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32";
import { ProjectError } from "./errors";
import { readZip } from "./zip-read";
import { writeZip } from "./zip-write";

const enc = new TextEncoder();
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const zipOf = async (names: string[], data = new Uint8Array([1, 2, 3])) =>
  bytesOf(writeZip(names.map((name) => ({ name, data }))));

// Offset of the central directory entry for `name`.
function central(zip: Uint8Array, name: string): number {
  const v = new DataView(zip.buffer);
  let pos = v.getUint32(zip.length - 22 + 16, true);
  while (v.getUint32(pos, true) === 0x02014b50) {
    const len = v.getUint16(pos + 28, true);
    if (new TextDecoder().decode(zip.subarray(pos + 46, pos + 46 + len)) === name) return pos;
    pos += 46 + len;
  }
  throw new Error(`no central entry ${name}`);
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof ProjectError ? e.code : "other";
  }
  return "none";
}

describe("readZip", () => {
  it("round-trips writeZip output", async () => {
    const files = [
      { name: "manifest.json", data: enc.encode("{}") },
      { name: "images/A.png", data: new Uint8Array([9, 8, 7]) },
      { name: "empty", data: new Uint8Array() },
    ];
    const map = readZip(await bytesOf(writeZip(files)));
    expect([...map.keys()]).toEqual(files.map((f) => f.name));
    for (const f of files) expect(Array.from(map.get(f.name)!)).toEqual(Array.from(f.data));
  });

  it("reads a Finder-compressed project", () => {
    const map = readZip(
      new Uint8Array(readFileSync(new URL("./fixtures/ditto-sample.comp.zip", import.meta.url))),
    );
    expect([...map.keys()].sort()).toEqual(["images/A.mask.png", "images/A.png", "manifest.json"]);
    expect(new TextDecoder().decode(map.get("images/A.mask.png")!)).toBe(
      "mask mask mask mask mask mask",
    );
    expect(map.get("images/A.png")!.length).toBe(3000);
    expect(JSON.parse(new TextDecoder().decode(map.get("manifest.json")!)).hello).toBe(
      "world".repeat(200),
    );
  });

  it.each(["../evil.png", "/abs.png", "a\\b.png", "C:x.png"])(
    "rejects unsafe name %s",
    async (name) => {
      const zip = await zipOf([name]);
      expect(codeOf(() => readZip(zip))).toBe("unsafe_entry");
    },
  );

  it("rejects duplicate names", async () => {
    const zip = await zipOf(["a.png", "a.png"]);
    expect(codeOf(() => readZip(zip))).toBe("unsafe_entry");
  });

  it("rejects encryption and unknown methods", async () => {
    const enc1 = await zipOf(["a.png"]);
    new DataView(enc1.buffer).setUint16(central(enc1, "a.png") + 8, 0x0801, true);
    expect(codeOf(() => readZip(enc1))).toBe("not_zip");
    const m12 = await zipOf(["a.png"]);
    new DataView(m12.buffer).setUint16(central(m12, "a.png") + 10, 12, true);
    expect(codeOf(() => readZip(m12))).toBe("not_zip");
  });

  it("rejects oversize declarations", async () => {
    const big = await zipOf(["a.png"]);
    new DataView(big.buffer).setUint32(central(big, "a.png") + 24, 0xfffffffe, true);
    expect(codeOf(() => readZip(big))).toBe("too_large");
    const man = await zipOf(["manifest.json"]);
    new DataView(man.buffer).setUint32(central(man, "manifest.json") + 24, 5 * 1024 * 1024, true);
    expect(codeOf(() => readZip(man))).toBe("too_large");
  });

  it("rejects a crc mismatch", async () => {
    const zip = await zipOf(["a.png"]);
    zip[30 + 5] ^= 1; // first data byte after the 30-byte header and 5-byte name
    expect(codeOf(() => readZip(zip))).toBe("not_zip");
  });

  it("rejects non-zip bytes", () => {
    const junk = Uint8Array.from({ length: 100 }, (_, i) => (i * 73 + 11) & 0xff);
    expect(codeOf(() => readZip(junk))).toBe("not_zip");
  });

  it("returns an empty map for folder-only archives", async () => {
    expect(readZip(await zipOf(["a.comp/", "a.comp/images/"], new Uint8Array())).size).toBe(0);
  });

  it("strips a single .comp root and keeps two roots", async () => {
    const one = readZip(await zipOf(["x.comp/manifest.json", "x.comp/images/A.png"]));
    expect([...one.keys()]).toEqual(["manifest.json", "images/A.png"]);
    const two = readZip(await zipOf(["a.comp/manifest.json", "b.comp/images/A.png"]));
    expect([...two.keys()]).toEqual(["a.comp/manifest.json", "b.comp/images/A.png"]);
  });

  it("checksums what it returns", async () => {
    const map = readZip(await zipOf(["a.png"], new Uint8Array([5, 6])));
    expect(crc32(map.get("a.png")!)).toBe(crc32(new Uint8Array([5, 6])));
  });
});
