import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { distAliases, readExports, srcAliases } from "./package-aliases";
import { parseHeaders } from "./read-headers";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias:
      command === "build" ? distAliases(repoRoot, readExports(repoRoot)) : srcAliases(repoRoot),
  },
  // The dev server gets no CSP: it would block HMR. Preview serves the production headers.
  server: { port: 5300, fs: { allow: [repoRoot] } },
  preview: {
    port: 5301,
    headers: parseHeaders(readFileSync(new URL("public/_headers", import.meta.url), "utf8")),
  },
  // Nothing becomes a data: URL: the CSP has no font-src, so an inlined font subset is blocked.
  build: { outDir: "dist", assetsInlineLimit: 0 },
}));
