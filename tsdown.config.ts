import { cpSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "tsdown";

// Excalidraw's font file hashes must match its bundled JS, so the fonts ship from
// this package (dist/excalidraw-assets/fonts) instead of the host's node_modules.
// A tsdown hook, so every tsdown run (build, check:entry) leaves them in dist.
function copyExcalidrawFonts(): void {
  const entry = createRequire(import.meta.url).resolve("@excalidraw/excalidraw");
  const target = "dist/excalidraw-assets/fonts";
  cpSync(join(dirname(entry), "fonts"), target, { recursive: true });
  if (!readdirSync(join(target, "Excalifont")).some((name) => name.endsWith(".woff2"))) {
    throw new Error(`no .woff2 in ${target}/Excalifont`);
  }
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "comp/index": "src/comp/index.ts",
    "markdown/index": "src/markdown/index.ts",
    "audio-editor/index": "src/audio-editor/index.ts",
    "excalidraw/index": "src/excalidraw/index.ts",
  },
  format: ["esm"],
  platform: "neutral",
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  copy: [{ from: "src/styles.css", to: "dist" }],
  hooks: { "build:done": copyExcalidrawFonts },
});
