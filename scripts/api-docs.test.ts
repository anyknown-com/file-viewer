// @vitest-environment node
import { readFileSync } from "node:fs";
import { tsImport } from "tsx/esm/api";
import { beforeAll, describe, expect, it } from "vitest";
import { apiDocs, type ApiDocs, type ApiExport } from "./api-docs.mjs";

let api: ApiDocs;
beforeAll(async () => {
  api = await apiDocs();
}, 120_000);

const root = (): ApiExport[] => api.entries.find((e) => e.subpath === ".")!.exports;
const named = (name: string): ApiExport => root().find((e) => e.name === name)!;

describe("apiDocs", () => {
  it("has one entry per non-CSS subpath in package.json exports", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const expected = Object.keys(pkg.exports).filter((k) => !k.endsWith(".css"));
    expect(api.entries.map((e) => e.subpath).toSorted()).toEqual(expected.toSorted());
  });

  it("describes the root exports", () => {
    const viewer = named("FileViewer");
    expect(viewer.kind).toBe("component");
    expect(viewer.members.find((m) => m.name === "file")?.required).toBe(true);
    expect(viewer.members.find((m) => m.name === "onSave")?.required).toBe(false);
    expect(named("kindOf").kind).toBe("function");
    expect(named("kindOf").signature).toContain("limits");
    expect(named("ViewerError").kind).toBe("class");
    expect(named("ViewerError").members.map((m) => m.name)).toContain("code");
    expect(named("ViewerErrorCode").kind).toBe("type");
    expect(named("ViewerErrorCode").signature).toContain('"too_large"');
    const source = named("ByteSource");
    expect(source.kind).toBe("type");
    expect(source.members.map((m) => m.name)).toEqual(
      expect.arrayContaining(["size", "read", "blob"]),
    );
    expect(source.members.find((m) => m.name === "blob")?.required).toBe(false);
  });

  it("documents every export and every member", () => {
    const missing: string[] = [];
    for (const entry of api.entries) {
      for (const item of entry.exports) {
        if (!item.description) missing.push(`${entry.subpath} ${item.name}`);
        for (const m of item.members) {
          if (!m.description) missing.push(`${entry.subpath} ${item.name}.${m.name}`);
        }
      }
    }
    expect(missing, `missing JSDoc:\n${missing.join("\n")}`).toEqual([]);
  });

  it("lists messages with both languages and no duplicate keys", () => {
    const keys = api.messages.map((m) => m.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((k) => k.startsWith("common."))).toBe(true);
    expect(keys).toContain("error.too_large");
    const empty = api.messages.filter((r) => r.en === "" || r["zh-TW"] === "").map((r) => r.key);
    expect(empty).toEqual([]);
  });

  it("has the same keys in en and zh-TW for every table", async () => {
    const mod = await tsImport("../src/i18n/messages.ts", import.meta.url);
    const table = mod.commonMessages as Record<"en" | "zh-TW", Record<string, string>>;
    expect(Object.keys(table["zh-TW"]).toSorted()).toEqual(Object.keys(table.en).toSorted());
    for (const key of Object.keys(table.en)) {
      expect(api.messages.find((m) => m.key === key)?.en).toBe(table.en[key]);
    }
  });
});
