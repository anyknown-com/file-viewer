import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The storage CSP (storage public/_headers) without the accounts domain.
const csp =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // The fonts that `pnpm build` copies; served at /fonts/...
  publicDir: fileURLToPath(new URL("../../dist/excalidraw-assets", import.meta.url)),
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist", emptyOutDir: true },
  preview: { headers: { "Content-Security-Policy": csp } },
});
