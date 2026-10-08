// Packs the library and resolves every entry in the exports map the way a
// consumer would, so a missing build artefact fails here instead of on install.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Outside the package tree on purpose: Node self-references a package by its own
// name from anywhere inside it, which would resolve the workspace, not the tarball.
const scratch = mkdtempSync(join(tmpdir(), "anyknown-file-viewer-pack-"));

const tarball = execFileSync("npm", ["pack", "--pack-destination", scratch, "--silent"], {
  cwd: root,
})
  .toString()
  .trim()
  .split("\n")
  .at(-1);

execFileSync("tar", ["-xzf", join(scratch, tarball), "-C", scratch]);

const packed = join(scratch, "package");
const consumer = join(scratch, "consumer");

const { name, exports } = JSON.parse(readFileSync(join(packed, "package.json"), "utf8"));
const linkPath = join(consumer, "node_modules", ...name.split("/"));
mkdirSync(dirname(linkPath), { recursive: true });
symlinkSync(packed, linkPath, "dir");
const require = createRequire(pathToFileURL(join(consumer, "index.mjs")));
const failures = [];

for (const subpath of Object.keys(exports)) {
  const specifier = subpath === "." ? name : `${name}/${subpath.slice(2)}`;
  try {
    const resolved = require.resolve(specifier);
    if (!existsSync(resolved)) throw new Error(`resolved to a missing file: ${resolved}`);
    console.log(`  ok  ${specifier} → ${resolved.replace(/^.*\/package\//, "")}`);
  } catch (error) {
    failures.push(`  FAIL ${specifier}: ${error.message}`);
  }
}

// Types entries are resolved by tsc, not by node — check them as plain files.
for (const [subpath, target] of Object.entries(exports)) {
  if (typeof target !== "object" || !target.types) continue;
  const file = join(packed, target.types);
  const specifier = subpath === "." ? name : `${name}/${subpath.slice(2)}`;
  if (existsSync(file)) console.log(`  ok  ${specifier} types → ${target.types}`);
  else failures.push(`  FAIL ${specifier} types: missing ${target.types}`);
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`\nall ${Object.keys(exports).length} export entries resolve from the packed tarball`);
