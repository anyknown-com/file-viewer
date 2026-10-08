import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

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
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] },
            }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
