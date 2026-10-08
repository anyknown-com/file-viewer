import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "comp/index": "src/comp/index.ts",
    "markdown/index": "src/markdown/index.ts",
  },
  format: ["esm"],
  platform: "neutral",
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  copy: [{ from: "src/styles.css", to: "dist" }],
});
