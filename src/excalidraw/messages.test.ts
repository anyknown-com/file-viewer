import { describe, expect, it } from "vitest";
import { excalidrawMessages } from "./messages";

describe("excalidrawMessages", () => {
  it("has the same keys in en and zh-TW, all prefixed", () => {
    expect(Object.keys(excalidrawMessages["zh-TW"]).toSorted()).toEqual(
      Object.keys(excalidrawMessages.en).toSorted(),
    );
    for (const k of Object.keys(excalidrawMessages.en)) {
      expect(k.startsWith("excalidraw.")).toBe(true);
    }
  });
});
