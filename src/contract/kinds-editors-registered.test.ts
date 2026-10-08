import { describe, expect, it, vi } from "vitest";
import { kindOf } from "./kinds";

vi.mock("../viewer/editors", () => ({ editors: { excalidraw: () => null } }));

const KiB = 1024;

describe("kindOf with an excalidraw editor registered", () => {
  it("gives excalidraw its edit kind", () => {
    expect(kindOf({ name: "d.excalidraw", size: KiB }).edit).toBe("excalidraw");
  });

  it("still gives an unregistered kind no edit", () => {
    expect(kindOf({ name: "a.png", size: KiB }).edit).toBeNull();
  });
});
