import { describe, expect, it } from "vitest";
import { isAbortError, toViewerError, ViewerError } from "./errors";

describe("ViewerError", () => {
  it("defaults message to code", () => {
    const e = new ViewerError("too_large");
    expect(e.code).toBe("too_large");
    expect(e.message).toBe("too_large");
    expect(e.name).toBe("ViewerError");
    expect(e).toBeInstanceOf(Error);
  });

  it("takes message and cause", () => {
    const c = new Error("c");
    const e = new ViewerError("read_failed", { message: "x", cause: c });
    expect(e.message).toBe("x");
    expect(e.cause).toBe(c);
  });
});

describe("toViewerError", () => {
  it("returns a ViewerError unchanged", () => {
    expect(toViewerError(new ViewerError("save_failed"), "read_failed").code).toBe("save_failed");
  });

  it("wraps other errors", () => {
    const boom = new Error("boom");
    const e = toViewerError(boom, "read_failed");
    expect(e.code).toBe("read_failed");
    expect(e.cause).toBe(boom);
  });
});

describe("isAbortError", () => {
  it("detects AbortError only", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});
