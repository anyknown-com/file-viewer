import type { Alias } from "vite";
import { describe, expect, it } from "vitest";
import { distAliases, srcAliases } from "./package-aliases";

// vitest runs from the repo root (site/vitest.config.ts sets test.root).
const root = process.cwd();

function resolveWith(aliases: Alias[], specifier: string): string | null {
  const hit = aliases.find((a) => (a.find instanceof RegExp ? a.find.test(specifier) : false));
  return hit ? hit.replacement : null;
}

describe("distAliases", () => {
  it("maps each export to its import or default file under dist", () => {
    const aliases = distAliases(root, {
      ".": { import: "./dist/index.js" },
      "./styles.css": "./dist/styles.css",
      "./markdown": { default: "./dist/markdown/index.js" },
    });
    expect(aliases).toHaveLength(3);
    expect(resolveWith(aliases, "@anyknown/file-viewer")).toBe(`${root}/dist/index.js`);
    expect(resolveWith(aliases, "@anyknown/file-viewer/styles.css")).toBe(
      `${root}/dist/styles.css`,
    );
    expect(resolveWith(aliases, "@anyknown/file-viewer/markdown")).toBe(
      `${root}/dist/markdown/index.js`,
    );
  });
});

describe("srcAliases", () => {
  it("maps subpaths to their source files", () => {
    const aliases = srcAliases(root);
    expect(resolveWith(aliases, "@anyknown/file-viewer")).toBe(`${root}/src/index.ts`);
    expect(resolveWith(aliases, "@anyknown/file-viewer/markdown")).toBe(
      `${root}/src/markdown/index.ts`,
    );
    expect(resolveWith(aliases, "@anyknown/file-viewer/styles.css")).toBe(`${root}/src/styles.css`);
  });

  it("matches only exact subpaths", () => {
    const dist = distAliases(root, { "./markdown": { default: "./dist/markdown/index.js" } });
    for (const aliases of [srcAliases(root), dist]) {
      expect(resolveWith(aliases, "@anyknown/file-viewer/markdownx")).toBeNull();
    }
  });
});
