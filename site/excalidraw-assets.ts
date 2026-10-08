// Vite plugin: serves and copies the Excalidraw fonts so the page never asks esm.sh for them.
import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { Plugin } from "vite";

const PREFIX = "/excalidraw-assets/fonts/";
const TYPES: Record<string, string> = { ".woff2": "font/woff2", ".woff": "font/woff" };

export function copyExcalidrawAssets(from: string, to: string): void {
  cpSync(from, to, { recursive: true });
}

export function excalidrawAssets(): Plugin {
  let root = "";
  let outDir = "";
  return {
    name: "excalidraw-assets",
    configResolved(config) {
      root = config.root;
      outDir = join(config.root, config.build.outDir);
    },
    configureServer(server) {
      const fonts = join(root, "..", "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (!url.startsWith(PREFIX)) return next();
        const file = normalize(join(fonts, url.slice(PREFIX.length)));
        if (!file.startsWith(fonts) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      copyExcalidrawAssets(
        join(root, "..", "dist/excalidraw-assets"),
        join(outDir, "excalidraw-assets"),
      );
    },
  };
}
