// Proves diagrams render under the storage CSP with no request off the page's origin, and that the
// Excalidraw fonts come from the host's copy of dist/excalidraw-assets.
// Usage: node scripts/csp-smoke.mjs  (run `pnpm build` first; `pnpm test:csp` does both)
import { chromium } from "playwright";
import { build, preview } from "vite";

// Two violations are Excalidraw 0.18.1's own and harmless; anything else fails the run:
// - font-src for its esm.sh fallback, which it appends to every font's src list and which cannot be
//   turned off. Chrome checks each listed source against the CSP when the face is registered, so
//   each face reports one, but nothing is fetched (with no CSP the page makes no esm.sh request).
// - script-src eval from the woff2 decoder used for glyph subsetting. Excalidraw catches it and
//   embeds the whole font instead, so the diagram still renders in Excalifont.
const fallback = "https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/";
const known = (v) => v === "script-src eval" || v.startsWith(`font-src ${fallback}`);

const configFile = "test/csp/vite.config.ts";
await build({ configFile, logLevel: "warn" });
const server = await preview({ configFile, preview: { port: 0 } });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;

const browser = await chromium.launch();
const failures = [];
const outside = [];
let fontOk = false;
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  // A request the CSP blocks never leaves the browser; every other one must stay on the origin.
  page.on("requestfinished", (r) => {
    const url = r.url();
    if (url.startsWith("blob:") || url.startsWith("data:")) return;
    if (new URL(url).origin !== origin) outside.push(url);
  });
  page.on("requestfailed", (r) => {
    const url = r.url();
    if (r.failure()?.errorText === "csp") return;
    if (new URL(url).origin !== origin) outside.push(url);
  });
  page.on("response", (r) => {
    if (new URL(r.url()).pathname.startsWith("/fonts/Excalifont/") && r.status() === 200) {
      fontOk = true;
    }
  });

  const open = async (f, selector, count) => {
    await page.goto(`${base}?f=${f}`);
    try {
      await page.waitForFunction(
        ([s, n]) => document.querySelectorAll(s).length === n,
        [selector, count],
        { timeout: 30_000 },
      );
    } catch {
      failures.push(`?f=${f}: expected ${count} × ${selector}`);
    }
    for (const v of await page.evaluate(() => window.__violations)) {
      if (!known(v)) failures.push(`?f=${f}: csp violation ${v}`);
    }
  };
  await open("md", '.fv-diagram img[src^="blob:"]', 2);
  await open("excalidraw", 'img[src^="blob:"]', 1);
} finally {
  await browser.close();
  await server.close();
}

for (const url of outside) failures.push(`outside request: ${url}`);
if (!fontOk) failures.push("no 200 response from /fonts/Excalifont/");
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(
  `csp smoke ok: md and excalidraw on ${origin}, only the known excalidraw violations, no outside requests`,
);
