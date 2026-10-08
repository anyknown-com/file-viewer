import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { srcAliases } from "./package-aliases";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: srcAliases(repoRoot) },
  test: {
    root: repoRoot,
    environment: "jsdom",
    globals: true,
    include: ["site/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    exclude: ["**/node_modules/**", "site/dist/**"],
  },
});
