import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyExcalidrawAssets } from "./excalidraw-assets";

describe("copyExcalidrawAssets", () => {
  it("copies the directory tree as it is", () => {
    const base = mkdtempSync(join(tmpdir(), "fv-assets-"));
    const from = join(base, "from");
    mkdirSync(join(from, "fonts/Sub"), { recursive: true });
    writeFileSync(join(from, "fonts/a.woff2"), "a");
    writeFileSync(join(from, "fonts/b.woff2"), "b");
    writeFileSync(join(from, "fonts/Sub/c.woff2"), "c");
    const to = join(base, "out/excalidraw-assets");
    copyExcalidrawAssets(from, to);
    expect(readFileSync(join(to, "fonts/a.woff2"), "utf8")).toBe("a");
    expect(readFileSync(join(to, "fonts/b.woff2"), "utf8")).toBe("b");
    expect(readFileSync(join(to, "fonts/Sub/c.woff2"), "utf8")).toBe("c");
  });
});
