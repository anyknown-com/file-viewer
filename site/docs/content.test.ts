import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import list from "../../docs/guides/guides.json";
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
