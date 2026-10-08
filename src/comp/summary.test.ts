// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";
import { summarize } from "./summary";
import { validateLikeCompositor } from "./validate";

type Case = { name: string; manifest: Record<string, unknown>; summary: string };

// Each `summary` in the fixture was written from plan 09's rules, not produced by summarize().
const cases: Case[] = JSON.parse(readFileSync("src/comp/fixtures/summary-v1.json", "utf8"));
const parse = (manifest: unknown) =>
  parseManifest(new TextEncoder().encode(JSON.stringify(manifest)));

describe("summarize", () => {
  it("has the three golden cases", () => {
    expect(cases.map((c) => c.name)).toEqual(["poster.comp.zip", "b.comp.zip", "big.comp.zip"]);
  });

  for (const c of cases) {
    it(`matches the golden summary of ${c.name}`, () => {
      const manifest = parse(c.manifest);
      expect(validateLikeCompositor(manifest)).toEqual([]);
      expect(summarize(manifest, c.name)).toBe(c.summary);
    });
  }

  it("pluralizes layers and folders in the header", () => {
    const [poster] = cases;
    const manifest = parse(poster?.manifest);
    expect(summarize(manifest, "p").split("\n")[1]).toContain("6 layers · 1 folder ·");
    const one = { ...manifest, layers: manifest.layers.slice(0, 1) };
    expect(summarize(one, "p").split("\n")[1]).toBe("p · 1920×1080 · 72 ppi · 1 layer · top first");
    const two = { ...manifest, layers: manifest.layers.slice(0, 2) };
    expect(summarize(two, "p").split("\n")[1]).toContain("2 layers · top first");
  });
});
