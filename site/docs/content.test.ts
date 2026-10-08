import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import list from "../../docs/guides/guides.json";
import { parseHeaders } from "../read-headers";
import { GUIDES, guideByKey, guideKeyOfFile } from "./content";

const root = process.cwd();

it("points every guides.json entry at an existing file", () => {
  expect(list.filter((g) => !existsSync(join(root, g.file))).map((g) => g.file)).toEqual([]);
});

it("lists every Markdown file in docs/guides", () => {
  const files = new Set(list.map((g) => g.file));
  const missing = readdirSync(join(root, "docs/guides")).filter(
    (name) => name.endsWith(".md") && !files.has(`docs/guides/${name}`),
  );
  expect(missing).toEqual([]);
});

it("uses each key once", () => {
  const keys = list.map((g) => g.key);
  expect(new Set(keys).size).toBe(keys.length);
});

it("loads every guide body in guides.json order", () => {
  expect(GUIDES.map((g) => g.key)).toEqual(list.map((g) => g.key));
  expect(GUIDES.filter((g) => g.body === "").map((g) => g.key)).toEqual([]);
  expect(guideByKey("readme")?.file).toBe("README.md");
  expect(guideByKey("nope")).toBeUndefined();
});

it("maps link targets to guide keys", () => {
  expect(guideKeyOfFile("./CHANGELOG.md")).toBe("changelog");
  expect(guideKeyOfFile("../../README.md")).toBe("readme");
  expect(guideKeyOfFile("./nope.md")).toBeUndefined();
});

describe("connect.md", () => {
  const connect = readFileSync(join(root, "docs/guides/connect.md"), "utf8");
  const csp = connect.slice(
    connect.indexOf("## Content Security Policy"),
    connect.indexOf("## Theme"),
  );

  it("quotes the site's own Content-Security-Policy", () => {
    const headers = parseHeaders(readFileSync(join(root, "site/public/_headers"), "utf8"));
    const line = connect.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
    expect(line?.trim()).toBe(`Content-Security-Policy: ${headers["Content-Security-Policy"]}`);
  });

  it("has the four sections", () => {
    for (const heading of ["Content Security Policy", "Theme", "Fonts", "Vite"]) {
      expect(connect).toContain(`\n## ${heading}\n`);
    }
  });

  it("explains the Excalidraw fonts", () => {
    for (const s of ["dist/excalidraw-assets", "assetPath", "esm.sh"]) {
      expect(connect).toContain(s);
    }
  });

  it("explains the PDF iframe rule", () => {
    for (const s of ["<iframe>", "<embed>", "frame-src blob:", "object-src 'none'"]) {
      expect(csp).toContain(s);
    }
  });
});
