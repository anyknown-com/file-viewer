import { describe, expect, it } from "vitest";
import * as api from "./index";

describe("package entry", () => {
  it.each(["blobSource", "bytesSource", "kindOf", "mimeOf", "DEFAULT_LIMITS", "ViewerError"])(
    "exports %s",
    (name) => {
      expect(api).toHaveProperty(name);
    },
  );
  it("keeps readBlob internal", () => {
    expect(api).not.toHaveProperty("readBlob");
  });
});
