// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ProjectError } from "./errors";

describe("ProjectError", () => {
  it("carries code and details", () => {
    const e = new ProjectError("invalid", ["a", "b"]);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ProjectError");
    expect(e.code).toBe("invalid");
    expect(e.details).toEqual(["a", "b"]);
    expect(e.message).toContain("a; b");
  });

  it("defaults details to empty", () => {
    expect(new ProjectError("not_zip").details).toEqual([]);
  });
});
