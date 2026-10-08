// @vitest-environment node
import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32";

const enc = new TextEncoder();

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });

  it("is 0 for empty input", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("accumulates across segments", () => {
    const a = enc.encode("12345");
    const b = enc.encode("6789");
    expect(crc32(b, crc32(a))).toBe(0xcbf43926);
  });
});
