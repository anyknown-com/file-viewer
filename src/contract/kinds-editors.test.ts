import { describe, expect, it, vi } from "vitest";
import { kindOf } from "./kinds";

vi.mock("../viewer/editors", () => ({ editors: {} }));

const KiB = 1024;

describe("kindOf with no editor registered", () => {
  it.each(["d.excalidraw", "a.png", "clip.mp4", "a.mp3", "x.comp.zip"])(
    "gives %s no edit",
    (name) => {
      expect(kindOf({ name, size: KiB }).edit).toBeNull();
    },
  );

  it("leaves view alone", () => {
    expect(kindOf({ name: "a.png", size: KiB }).view).toBe("image");
  });
});
