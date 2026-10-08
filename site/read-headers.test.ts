import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseHeaders } from "./read-headers";

const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const text = readFileSync(join(process.cwd(), "site/public/_headers"), "utf8");

it("reads the four site headers with the full minimum csp", () => {
  const headers = parseHeaders(text);
  expect(Object.keys(headers).toSorted()).toEqual([
    "Content-Security-Policy",
    "Permissions-Policy",
    "Referrer-Policy",
    "X-Content-Type-Options",
  ]);
  expect(headers["Content-Security-Policy"]).toBe(CSP);
});

it("ignores blocks for other paths", () => {
  const headers = parseHeaders(`${text}\n/x/*\n  X-Other: 1\n  Referrer-Policy: origin\n`);
  expect(headers["X-Other"]).toBeUndefined();
  expect(headers["Referrer-Policy"]).toBe("no-referrer");
});

it("shows pdfs in a blob iframe, never through embed or object", () => {
  const csp = parseHeaders(text)["Content-Security-Policy"]!;
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-src blob:");
  expect(csp).not.toContain("embed");
  expect(csp).not.toContain("form-action");
});
