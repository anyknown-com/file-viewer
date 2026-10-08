// The playground stays self-contained so a standalone tool page can mount it as is: it imports
// only the published package, Base UI, React and files in its own folder.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const DIR = join(process.cwd(), "site/playground");
const ALLOWED = [
  /^@anyknown\/file-viewer(\/[^/]+)?$/,
  /^@base-ui\/react\/.+$/,
  /^react$/,
  /^react-dom(\/.+)?$/,
  /^\.\/[^/]+$/,
  // The sample list ships with the playground; its files are served from public/samples/.
  /^\.\.\/public\/samples\/samples\.json$/,
];

it("imports only the package, Base UI, React and its own folder", () => {
  const files = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const text = readFileSync(join(DIR, file), "utf8");
    const sources = [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
      (m) => m[1]!,
    );
    for (const source of sources) {
      expect(
        ALLOWED.some((re) => re.test(source)),
        `${file} imports ${source}`,
      ).toBe(true);
    }
  }
});
