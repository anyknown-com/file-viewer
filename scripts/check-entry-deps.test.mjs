// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dynamicIndexTargets, findViolations, staticGraph } from "./check-entry-deps.mjs";

function dist(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fv-entry-"));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

async function violations(files) {
  const dir = dist(files);
  return findViolations(await staticGraph(path.join(dir, "index.js")));
}

describe("staticGraph and findViolations", () => {
  it("catches a heavy dependency behind a static chunk", async () => {
    const lines = await violations({
      "index.js": 'import "./chunk.js";',
      "chunk.js": 'import "mediabunny";',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("mediabunny");
    expect(lines[0]).toContain("chunk.js");
  });

  it("does not follow dynamic imports", async () => {
    expect(await violations({ "index.js": 'import("mediabunny");' })).toEqual([]);
  });

  it("follows export-from", async () => {
    const lines = await violations({
      "index.js": 'export * from "./x.js";',
      "x.js": 'import "fflate";',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("fflate");
  });

  it("fails when the graph is over the size limit", async () => {
    const lines = await violations({ "index.js": `// ${"a".repeat(70000)}\n` });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("limit 65536");
  });

  it("allows react", async () => {
    expect(await violations({ "index.js": 'import "react";' })).toEqual([]);
  });
});

describe("dynamicIndexTargets", () => {
  it("flags dynamic imports of index files", async () => {
    const dir = dist({
      "chunk.js": 'import("./index-Ab12.js");',
      "other.js": 'import("../markdown/index.js");',
    });
    const lines = await dynamicIndexTargets(dir);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.includes("index-Ab12.js") && l.includes("chunk.js"))).toBe(true);
    expect(lines.some((l) => l.includes("../markdown/index.js"))).toBe(true);
  });

  it("ignores named chunks, bare specifiers and static imports", async () => {
    const dir = dist({
      "chunk.js": 'import("./video-editor-Ab12.js");\nimport("react");\nimport "./index.js";',
      "index.js": "export {};",
    });
    expect(await dynamicIndexTargets(dir)).toEqual([]);
  });
});
