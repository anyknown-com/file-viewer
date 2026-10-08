import { UnsupportedInputFormatError } from "mediabunny";
import { describe, expect, it } from "vitest";
import { ViewerError } from "../contract/errors";
import { toMediaError } from "./media-error";

describe("toMediaError", () => {
  it("rethrows abort errors as is", () => {
    const e = new DOMException("x", "AbortError");
    let thrown: unknown;
    try {
      toMediaError(e, "decode_failed");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBe(e);
  });

  it("returns a ViewerError as is", () => {
    const e = new ViewerError("read_failed");
    expect(toMediaError(e, "decode_failed")).toBe(e);
  });

  it("finds a ViewerError along the cause chain", () => {
    const inner = new ViewerError("read_failed", { cause: 1 });
    expect(toMediaError(new Error("x", { cause: inner }), "decode_failed")).toBe(inner);
  });

  it("maps unsupported input formats", () => {
    const e = new UnsupportedInputFormatError();
    const out = toMediaError(e, "decode_failed");
    expect(out.code).toBe("unsupported");
    expect(out.cause).toBe(e);
  });

  it("falls back to the given code", () => {
    const out = toMediaError("boom", "decode_failed");
    expect(out.code).toBe("decode_failed");
    expect(out.cause).toBe("boom");
  });
});
