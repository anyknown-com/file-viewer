// Proves the built site needs no server and no CSP relaxation: under the production headers it
// opens every sample and a local file with no CSP violation and no request off the site's origin.
// Usage: node scripts/site-smoke.mjs [url]  (no url: serves site/dist with `vite preview`)
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

const samples = JSON.parse(readFileSync("site/public/samples/samples.json", "utf8"));

const server = process.argv[2] ? null : await preview({ configFile: "site/vite.config.ts" });
const base = process.argv[2] ?? server.resolvedUrls.local[0];
const origin = new URL(base).origin;

const browser = await chromium.launch();
const failures = [];
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp.push(e.violatedDirective + " " + e.blockedURI);
    });
  });
  let requests = [];
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));

  // Only same-origin GETs under the given path prefixes are allowed. The viewer's own object URLs
  // (blob:<origin>/<uuid>) show up as requests too; they read memory in this tab, not the network.
  const checkRequests = (label, prefixes) => {
    for (const { method, url } of requests) {
      if (method === "GET" && url.startsWith(`blob:${origin}/`)) continue;
      const u = new URL(url);
      const ok =
        method === "GET" && u.origin === origin && prefixes.some((p) => u.pathname.startsWith(p));
      if (!ok) failures.push(`${label}: unexpected request ${method} ${url}`);
    }
  };

  await page.goto(base);
  await page.waitForLoadState("networkidle");

  for (const sample of samples) {
    requests = [];
    await page.click(`[data-sample="${sample.file}"]`);
    try {
      // The sample is fetched first; until then the previous file is still on screen.
      await page.waitForSelector(`.pg-name:text-is("${sample.file}")`, { timeout: 15_000 });
      await page.waitForSelector(`.fv-root ${sample.expect}`, { timeout: 15_000 });
    } catch {
      failures.push(`${sample.file}: .fv-root ${sample.expect} did not appear`);
    }
    checkRequests(sample.file, ["/samples/", "/assets/"]);
  }

  const local = join(mkdtempSync(join(tmpdir(), "fv-smoke-")), "local.txt");
  writeFileSync(local, "local file");
  requests = [];
  await page.setInputFiles("[data-playground-input]", local);
  try {
    await page.waitForSelector(".fv-root pre:has-text('local file')", { timeout: 15_000 });
  } catch {
    failures.push("local.txt: .fv-root pre with its text did not appear");
  }
  checkRequests("local.txt", ["/assets/"]);

  for (const violation of await page.evaluate(() => window.__csp)) {
    failures.push(`csp violation: ${violation}`);
  }
} finally {
  await browser.close();
  await server?.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`site smoke ok: ${samples.length} samples and a local file on ${origin}`);
