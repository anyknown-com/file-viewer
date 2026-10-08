// @vitest-environment node
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32";
import { decodePng } from "./png-decode";
import { createPngEncoder, encodeMask, encodePng } from "./png-encode";

function pattern(w: number, h: number, channels: 1 | 4, alpha?: number) {
  const data = new Uint8Array(w * h * channels);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i >> 3) * 11) & 0xff;
  if (channels === 4) for (let i = 3; i < data.length; i += 4) data[i] = alpha ?? (i >> 2) % 255;
  return { width: w, height: h, channels, data };
}

const colorType = (png: Uint8Array) => png[25];

describe("encodePng", () => {
  it("writes rgba, rgb and gray and pngjs reads them back", () => {
    const rgba = pattern(16, 9, 4);
    const rgb = pattern(16, 9, 4, 255);
    const gray = pattern(16, 9, 1);
    const a = encodePng(rgba);
    const b = encodePng(rgb);
    const c = encodePng(gray);
    expect([colorType(a), colorType(b), colorType(c)]).toEqual([6, 2, 0]);
    expect(Array.from(PNG.sync.read(Buffer.from(a)).data)).toEqual(Array.from(rgba.data));
    expect(Array.from(PNG.sync.read(Buffer.from(b)).data)).toEqual(Array.from(rgb.data));
    const g = PNG.sync.read(Buffer.from(c)).data;
    expect(Array.from(g.filter((_, i) => i % 4 === 0))).toEqual(Array.from(gray.data));
  });

  it("round-trips straight alpha 1..254 without premultiplying", () => {
    const data = new Uint8Array(254 * 4);
    for (let i = 0; i < 254; i++)
      data.set([(i * 7) & 255, (i * 13) & 255, (i * 29) & 255, i + 1], i * 4);
    const image = { width: 254, height: 1, channels: 4 as const, data };
    expect(decodePng(encodePng(image), "layer")).toEqual(image);
  });
});

describe("encodeMask", () => {
  it("writes a uniform mask as 1x1", () => {
    const out = decodePng(
      encodeMask({ width: 8, height: 8, channels: 1, data: new Uint8Array(64).fill(128) }),
      "mask",
    );
    expect(out).toEqual({ width: 1, height: 1, channels: 1, data: new Uint8Array([128]) });
  });

  it("keeps the size of a non-uniform mask", () => {
    const mask = pattern(8, 8, 1);
    expect(decodePng(encodeMask(mask), "mask")).toEqual(mask);
  });

  it("rejects non-gray input", () => {
    expect(() => encodeMask(pattern(2, 2, 4))).toThrow("one channel");
  });
});

describe("createPngEncoder", () => {
  const concat = (parts: Uint8Array[]) => new Uint8Array(parts.flatMap((p) => Array.from(p)));
  const rows = pattern(20, 30, 4).data;

  it("gives the same pixels for banded and single pushes", () => {
    const one = createPngEncoder({ width: 20, height: 30, color: "rgba" });
    one.push(rows);
    const three = createPngEncoder({ width: 20, height: 30, color: "rgba" });
    for (let i = 0; i < 3; i++) three.push(rows.slice(i * 10 * 80, (i + 1) * 10 * 80));
    const a = decodePng(concat(one.end()), "layer");
    const b = decodePng(concat(three.end()), "layer");
    expect(b).toEqual(a);
    expect(Array.from(a.data)).toEqual(Array.from(rows));
  });

  it("throws on partial rows and short images", () => {
    const e = createPngEncoder({ width: 20, height: 30, color: "rgba" });
    expect(() => e.push(rows.slice(0, 79))).toThrow("whole number");
    e.push(rows.slice(0, 80));
    expect(() => e.end()).toThrow("row count");
  });

  it("writes correct IDAT CRCs", () => {
    const e = createPngEncoder({ width: 20, height: 30, color: "rgba" });
    e.push(rows);
    const idats = e.end().filter((c) => String.fromCharCode(...c.subarray(4, 8)) === "IDAT");
    expect(idats.length).toBeGreaterThan(0);
    for (const c of idats) {
      const view = new DataView(c.buffer, c.byteOffset);
      expect(view.getUint32(c.length - 4)).toBe(crc32(c.subarray(4, c.length - 4)));
    }
  });
});
