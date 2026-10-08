import { cpSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { defineConfig, Rolldown } from "tsdown";

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

// rolldown leaves `new URL("./x.ts", import.meta.url)` (the same-origin module worker) as is, so
// dist would point at a .ts it never ships. Emit each target as its own chunk and point the URL at
// that chunk, still as a `new URL("./….js", import.meta.url)` literal so a host bundler can follow it.
function newUrlChunks(): Rolldown.Plugin {
  const pattern = /new URL\((["'])(\.{1,2}\/[^"']+\.ts)\1, import\.meta\.url\)/g;
  return {
    name: "new-url-chunks",
    async transform(code, id) {
      const matches = [...code.matchAll(pattern)];
      if (matches.length === 0) return null;
      const out = new Rolldown.RolldownMagicString(code);
      const targets = await Promise.all(matches.map((m) => this.resolve(m[2], id)));
      for (const [i, m] of matches.entries()) {
        const resolved = targets[i];
        if (!resolved) this.error(`cannot resolve ${m[2]} from ${id}`);
        const name = relative("src", resolved.id).replace(/\.ts$/, "");
        const ref = this.emitFile({ type: "chunk", id: resolved.id, importer: id, name });
        out.overwrite(m.index, m.index + m[0].length, `import.meta.ROLLUP_FILE_URL_${ref}`);
      }
      return { code: out };
    },
    resolveFileUrl: ({ relativePath }) =>
      `new URL(${JSON.stringify(relativePath.startsWith(".") ? relativePath : `./${relativePath}`)}, import.meta.url)`,
  };
}

const entry = {
  index: "src/index.ts",
  "comp/index": "src/comp/index.ts",
  "markdown/index": "src/markdown/index.ts",
  "audio-editor/index": "src/audio-editor/index.ts",
  "excalidraw/index": "src/excalidraw/index.ts",
  "video-editor/index": "src/video-editor/index.ts",
  "image-editor/index": "src/image-editor/index.ts",
};

export default defineConfig({
  entry,
  format: ["esm"],
  platform: "neutral",
  // Types only for the exports map's entries, not for the chunks newUrlChunks emits.
  dts: { entry: Object.values(entry) },
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  copy: [{ from: "src/styles.css", to: "dist" }],
  plugins: [newUrlChunks()],
  hooks: { "build:done": copyExcalidrawFonts },
});
