import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ALLOWED = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "Zlib",
];
export const FONT_PACKAGE = /^@fontsource(-variable)?\//;
// Packages whose package.json has no license field, checked by hand against their LICENSE file.
export const OVERRIDES = {
  khroma: "MIT", // khroma 2.1.0: LICENSE file is The MIT License
};

function isAllowed(reported, name) {
  const license = OVERRIDES[name] ?? reported;
  if (license === "MPL-2.0" && name === "mediabunny") return true;
  if (license === "OFL-1.1" && FONT_PACKAGE.test(name)) return true;
  const options = license
    .replace(/^\(|\)$/g, "")
    .split(/\s+OR\s+/)
    .map((option) => option.replace(/^\(|\)$/g, "").split(/\s+AND\s+/));
  return options.some((parts) => parts.every((part) => ALLOWED.includes(part.trim())));
}

export function checkLicenses(report, deps, notices) {
  const problems = [];
  for (const [license, packages] of Object.entries(report)) {
    for (const { name } of packages) {
      if (!isAllowed(license, name)) problems.push(`${name} has license ${license}, not allowed`);
    }
  }
  for (const dep of deps) {
    if (!notices.includes(dep)) problems.push(`${dep} is not listed in THIRD_PARTY_NOTICES.md`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const report = raw === "" || raw.startsWith("No licenses") ? {} : JSON.parse(raw);
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const notices = readFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
  const problems = checkLicenses(report, Object.keys(pkg.dependencies ?? {}), notices);
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    process.exit(1);
  }
  const count = Object.values(report).reduce((sum, list) => sum + list.length, 0);
  console.log(`licenses ok: ${count} production packages`);
}
