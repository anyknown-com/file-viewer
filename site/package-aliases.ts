// Maps `@anyknown/file-viewer` and each subpath to a file, one exact regex per export, so the
// site resolves the package either from `src/` (dev, tests) or from `dist/` (build: the site is
// then a real host of the published package).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Alias } from "vite";

type ExportTarget = string | { import?: string; default?: string };

const NAME = "@anyknown/file-viewer";

function exactly(subpath: string): RegExp {
  const specifier = subpath === "." ? NAME : NAME + subpath.slice(1);
  return new RegExp("^" + specifier.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "$");
}

// "." → src/index.ts; "./<file>.css" → src/<file>.css; "./<name>" → src/<name>/index.ts
function srcFile(subpath: string): string {
  if (subpath === ".") return "src/index.ts";
  const name = subpath.slice(2);
  return name.endsWith(".css") ? `src/${name}` : `src/${name}/index.ts`;
}

export function readExports(root: string): Record<string, ExportTarget> {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    exports: Record<string, ExportTarget>;
  };
  return pkg.exports;
}

export function srcAliases(root: string): Alias[] {
  return Object.keys(readExports(root)).map((subpath) => ({
    find: exactly(subpath),
    replacement: resolve(root, srcFile(subpath)),
  }));
}

export function distAliases(root: string, exportsMap: Record<string, ExportTarget>): Alias[] {
  return Object.entries(exportsMap).flatMap(([subpath, target]) => {
    const file = typeof target === "string" ? target : (target.import ?? target.default);
    return file ? [{ find: exactly(subpath), replacement: resolve(root, file) }] : [];
  });
}
