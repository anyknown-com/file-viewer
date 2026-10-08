// @vitest-environment node
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32";
import type { ProjectError } from "./errors";
import { decodePng, pngSize } from "./png-decode";

const dir = new URL("./fixtures/pngsuite/", import.meta.url);
const load = (name: string) => new Uint8Array(readFileSync(new URL(name, dir)));
const FIXTURES = [
  "basn0g04",
  "basn0g08",
  "basn2c08",
  "basn3p04",
  "basn3p08",
  "basn4a08",
  "basn6a08",
  "tbbn3p08",
  "tbrn2c08",
  "basi0g08",
  "basi3p08",
  "basi6a08",
];

function chunk(type: string, data: number[] | Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  body.set([...type].map((c) => c.charCodeAt(0)));
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}

// Inserts `extra` right after the IHDR chunk (offset 8 + 25).
function insertAfterIhdr(png: Uint8Array, extra: Uint8Array): Uint8Array {
  const out = new Uint8Array(png.length + extra.length);
  out.set(png.subarray(0, 33));
  out.set(extra, 33);
  out.set(png.subarray(33), 33 + extra.length);
  return out;
}

// pngjs zeroes the RGB of color-keyed transparent pixels; we keep it. Compare with alpha 0 pixels zeroed.
function clearTransparent(data: Uint8Array): Buffer {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) if (out[i + 3] === 0) out.fill(0, i, i + 3);
  return out;
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as ProjectError).code;
  }
  return undefined;
}

describe("decodePng", () => {
  for (const name of FIXTURES) {
    it(`matches pngjs for ${name}`, () => {
      const bytes = load(`${name}.png`);
      const mine = decodePng(bytes, "layer");
      const ref = PNG.sync.read(Buffer.from(bytes));
      expect(mine.channels).toBe(4);
      expect(mine.width).toBe(ref.width);
      expect(mine.height).toBe(ref.height);
      expect(clearTransparent(mine.data).equals(clearTransparent(ref.data))).toBe(true);
    });
  }

  it("rejects 16-bit", () => {
    expect(code(() => decodePng(load("basn0g16.png"), "layer"))).toBe("bad_png");
  });

  it("decodes an 8-bit gray mask as one channel", () => {
    const bytes = load("basn0g08.png");
    const mask = decodePng(bytes, "mask");
    const ref = PNG.sync.read(Buffer.from(bytes));
    expect(mask.channels).toBe(1);
    expect(Array.from(mask.data)).toEqual(
      Array.from({ length: ref.width * ref.height }, (_, i) => ref.data[i * 4]),
    );
  });

  it("rejects masks that are not 8-bit gray", () => {
    expect(code(() => decodePng(load("basn4a08.png"), "mask"))).toBe("bad_png");
    expect(code(() => decodePng(load("basn2c08.png"), "mask"))).toBe("bad_png");
  });

  it("rejects a corrupt IDAT", () => {
    const bytes = load("basn6a08.png").slice();
    const at = bytes.indexOf(0x49, 40); // 'I' of IDAT
    bytes[at + 6] ^= 0xff;
    expect(code(() => decodePng(bytes, "layer"))).toBe("bad_png");
  });

  it("rejects acTL and unknown critical chunks, skips ancillary ones", () => {
    const base = load("basn6a08.png");
    const apng = insertAfterIhdr(base, chunk("acTL", [0, 0, 0, 1, 0, 0, 0, 0]));
    expect(code(() => decodePng(apng, "layer"))).toBe("bad_png");
    const critical = insertAfterIhdr(base, chunk("ABCD", [1, 2, 3]));
    expect(code(() => decodePng(critical, "layer"))).toBe("bad_png");
    const ancillary = insertAfterIhdr(base, chunk("abCD", [1, 2, 3]));
    expect(decodePng(ancillary, "layer")).toEqual(decodePng(base, "layer"));
  });
});

describe("pngSize", () => {
  it("reads the size from the first 33 bytes", () => {
    const bytes = load("basn6a08.png");
    expect(pngSize(bytes.subarray(0, 33))).toEqual({ width: 32, height: 32 });
  });

  it("rejects 32 bytes", () => {
    expect(code(() => pngSize(load("basn6a08.png").subarray(0, 32)))).toBe("bad_png");
  });

  it("rejects a width over 30000", () => {
    const head = new Uint8Array(33);
    head.set(load("basn6a08.png").subarray(0, 8));
    head.set(chunk("IHDR", [0, 0, 0x75, 0x31, 0, 0, 0, 1, 8, 6, 0, 0, 0]), 8);
    expect(code(() => pngSize(head))).toBe("bad_png");
    expect(code(() => decodePng(head, "layer"))).toBe("bad_png");
  });
});
