import { describe, expect, it } from "vitest";
import { splitName, suggestedName } from "./save";

describe("splitName", () => {
  it("splits name and extension", () => {
    expect(splitName("a.md")).toEqual({ stem: "a", ext: ".md" });
    expect(splitName("A.COMP.ZIP")).toEqual({ stem: "A", ext: ".COMP.ZIP" });
    expect(splitName("x.tar.gz")).toEqual({ stem: "x.tar", ext: ".gz" });
    expect(splitName(".bashrc")).toEqual({ stem: ".bashrc", ext: "" });
    expect(splitName("a.")).toEqual({ stem: "a.", ext: "" });
    expect(splitName("noext")).toEqual({ stem: "noext", ext: "" });
  });
});

describe("suggestedName", () => {
  it("names by mode", () => {
    expect(suggestedName("clip.mov", ".mp4", "copy")).toBe("clip (edited).mp4");
    expect(suggestedName("photo.jpg", ".comp.zip", "replace")).toBe("photo.comp.zip");
    expect(suggestedName("p.comp.zip", ".png", "export")).toBe("p (edited).png");
  });
});
