// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { missingNewUrlTargets } from "./new-url-targets.mjs";

function pack(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fv-new-url-"));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

const worker = (spec) => `new Worker(new URL(${spec}, import.meta.url), { type: "module" });`;

describe("missingNewUrlTargets", () => {
  it("passes when every relative target ships", () => {
    const dir = pack({
      "dist/image-editor/index.js": worker('"./worker/worker.js"'),
      "dist/image-editor/worker/worker.js": "",
      "dist/chunk.js": `${worker("'../dist/image-editor/worker/worker.js?v=1'")}`,
    });
    expect(missingNewUrlTargets(dir)).toEqual([]);
  });

  it("reports a target the pack does not ship", () => {
    const dir = pack({ "dist/image-editor/index.js": worker('"./worker.ts"') });
    expect(missingNewUrlTargets(dir)).toEqual([
      `${path.join("dist", "image-editor", "index.js")}: new URL("./worker.ts") → missing`,
    ]);
  });

  it("reports a target outside the package", () => {
    const dir = pack({ "dist/index.js": worker('"../../outside.js"') });
    expect(missingNewUrlTargets(dir)).toHaveLength(1);
  });

  it("ignores absolute and dynamic URLs and other bases", () => {
    const dir = pack({
      "dist/index.js": [
        'new URL("https://example.com/a.js", import.meta.url);',
        'new URL("/abs.js", import.meta.url);',
        "new URL(`./${name}.js`, import.meta.url);",
        'new URL("./x.js", base);',
      ].join("\n"),
    });
    expect(missingNewUrlTargets(dir)).toEqual([]);
  });
});
