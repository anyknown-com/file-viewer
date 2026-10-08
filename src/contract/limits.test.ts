import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, resolveLimits } from "./limits";

describe("resolveLimits", () => {
  it("returns a fresh copy of the defaults", () => {
    const r = resolveLimits();
    expect(r).toEqual(DEFAULT_LIMITS);
    expect(r).not.toBe(DEFAULT_LIMITS);
  });

  it("overrides only given fields", () => {
    expect(resolveLimits({ textBytes: 5 })).toEqual({ ...DEFAULT_LIMITS, textBytes: 5 });
  });

  it("ignores undefined fields", () => {
    expect(resolveLimits({ textBytes: undefined })).toEqual(DEFAULT_LIMITS);
  });

  it("freezes DEFAULT_LIMITS", () => {
    expect(Object.isFrozen(DEFAULT_LIMITS)).toBe(true);
  });
});
