import { afterEach, describe, expect, it, vi } from "vitest";
import { hasVideoCodecs } from "./support";

afterEach(() => vi.unstubAllGlobals());

describe("hasVideoCodecs", () => {
  it("is false without WebCodecs", () => {
    expect(hasVideoCodecs()).toBe(false);
  });

  it("is true with decoder and encoder", () => {
    vi.stubGlobal("VideoDecoder", function () {});
    vi.stubGlobal("VideoEncoder", function () {});
    expect(hasVideoCodecs()).toBe(true);
  });

  it("is false with only a decoder", () => {
    vi.stubGlobal("VideoDecoder", function () {});
    expect(hasVideoCodecs()).toBe(false);
  });
});
