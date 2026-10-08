import { resolve } from "node:path";
import { expect, it } from "vitest";
import { readExports, srcFile } from "../package-aliases";
import { GUIDES } from "./content";

const root = process.cwd();
const CODE = /```tsx?\n([\s\S]*?)```/g;
const IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*"@anyknown\/file-viewer(\/[^"]+)?"/g;

type Use = { guide: string; subpath: string; name: string };

// `{ a, type B, c as d }` → ["a", "c"]
function valueNames(braces: string): string[] {
  return braces
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/)[0] ?? "")
    .filter((name) => name !== "" && !name.startsWith("type "));
}

function valueImports(): Use[] {
  const uses: Use[] = [];
  for (const guide of GUIDES) {
    for (const [, code = ""] of guide.body.matchAll(CODE)) {
      for (const [, typeOnly, braces = "", sub] of code.matchAll(IMPORT)) {
        if (typeOnly) continue;
        const subpath = sub ? `.${sub}` : ".";
        for (const name of valueNames(braces)) uses.push({ guide: guide.key, subpath, name });
      }
    }
  }
  return uses;
}

it("imports only names the package exports at runtime", async () => {
  const uses = valueImports();
  expect(uses.length).toBeGreaterThan(0);
  const exported = Object.keys(readExports(root));
  const used = [...new Set(uses.map((use) => use.subpath))];
  expect(used.filter((subpath) => !exported.includes(subpath))).toEqual([]);
  // Only the subpaths the guides use are loaded: some (excalidraw) don't load outside a bundler.
  const modules = new Map(
    await Promise.all(
      used.map(async (subpath): Promise<[string, Record<string, unknown>]> => [
        subpath,
        (await import(resolve(root, srcFile(subpath)))) as Record<string, unknown>,
      ]),
    ),
  );
  const missing = uses
    .filter((use) => !(use.name in (modules.get(use.subpath) ?? {})))
    .map((use) => `${use.guide}: ${use.name} from ${use.subpath}`);
  expect(missing).toEqual([]);
});
