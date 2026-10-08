import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { distAliases, readExports, srcAliases } from "./package-aliases";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias:
      command === "build" ? distAliases(repoRoot, readExports(repoRoot)) : srcAliases(repoRoot),
  },
  server: { port: 5300, fs: { allow: [repoRoot] } },
  build: { outDir: "dist" },
}));
