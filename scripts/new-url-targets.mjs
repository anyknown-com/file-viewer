// Every `new URL("…", import.meta.url)` in the packed JS must point at a file the tarball ships;
// a worker or asset the build left behind only shows up as a 404 in the host's browser.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const NEW_URL = /new URL\(\s*(["'`])([^"'`$]+)\1\s*,\s*import\.meta\.url\s*\)/g;

export function missingNewUrlTargets(dir) {
  const failures = [];
  for (const file of readdirSync(dir, { recursive: true })) {
    if (!/\.m?js$/.test(file) || file.split(sep).includes("node_modules")) continue;
    const path = join(dir, file);
    for (const [, , spec] of readFileSync(path, "utf8").matchAll(NEW_URL)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(spec) || spec.startsWith("/")) continue;
      const target = resolve(dirname(path), spec.replace(/[?#].*$/, ""));
      const inside = !relative(dir, target).startsWith("..");
      if (!inside || !existsSync(target)) failures.push(`${file}: new URL("${spec}") → missing`);
    }
  }
  return failures;
}
