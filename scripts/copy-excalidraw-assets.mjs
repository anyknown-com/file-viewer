// Copies Excalidraw's fonts into dist/excalidraw-assets/fonts so hosts serve them
// from their own origin. The font file hashes must match the bundled Excalidraw JS,
// which is why they ship from this package instead of the host's node_modules.
import { cpSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = createRequire(import.meta.url).resolve("@excalidraw/excalidraw");
const source = join(dirname(entry), "fonts");
const target = join(root, "dist", "excalidraw-assets", "fonts");

cpSync(source, target, { recursive: true });

const excalifont = join(target, "Excalifont");
const woff2 = existsSync(excalifont)
  ? readdirSync(excalifont).filter((name) => name.endsWith(".woff2"))
  : [];
if (woff2.length === 0) {
  console.error(`no .woff2 in ${excalifont}`);
  process.exit(1);
}
console.log(`excalidraw fonts copied to ${target}`);
