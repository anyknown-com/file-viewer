import { existsSync } from "node:fs";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Branded Chrome ships the proprietary codecs (AAC, H.264) that Playwright's Chromium lacks on
// Linux, so the codec tests run instead of skipping. CI installs it; locally it is used when found.
const CHROME_PATHS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/opt/google/chrome/chrome",
  win32: `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
};
const useChrome = Boolean(process.env.CI) || existsSync(CHROME_PATHS[process.platform] ?? "");
if (!useChrome) {
  process.stderr.write(
    "Google Chrome not found: browser tests run in Chromium; AAC/H.264 tests may skip.\n",
  );
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
          exclude: ["**/*.browser.test.*", "**/node_modules/**"],
        },
      },
      {
        // Crawl every browser test up front so a cold run (CI) finds all deps in one pass
        // instead of discovering them mid-run, re-optimizing and reloading the page.
        optimizeDeps: {
          entries: ["src/**/*.browser.test.{ts,tsx}"],
          include: ["fflate", "zod", "@excalidraw/excalidraw"],
        },
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          // One file at a time: every page's WebGL runs in the browser's one software GL (SwiftShader)
          // process, so parallel files only queue behind each other there and push single tests
          // past the timeout. The whole run takes about as long either way.
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                channel: useChrome ? "chrome" : undefined,
                // No GPU compositing: headless Chrome would composite every frame on SwiftShader,
                // slowing each GL test by a factor of ten or more.
                args: [
                  "--enable-unsafe-swiftshader",
                  "--use-angle=swiftshader",
                  "--disable-gpu-compositing",
                ],
              },
            }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
