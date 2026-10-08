import { describe, expect, it } from "vitest";
import { audioMessages } from "./messages";

const placeholders = (s: string) => (s.match(/\{(count|size|time)\}/g) ?? []).toSorted();

describe("audioMessages", () => {
  const en = audioMessages.en;
  const zh = audioMessages["zh-TW"];

  it("has the same keys in both locales", () => {
    expect(Object.keys(zh).toSorted()).toEqual(Object.keys(en).toSorted());
  });

  it("has no empty values and only audio.* keys", () => {
    for (const table of [en, zh]) {
      for (const [key, value] of Object.entries(table)) {
        expect(key.startsWith("audio.")).toBe(true);
        expect(value).not.toBe("");
      }
    }
  });

  it("uses the same placeholders in both locales", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect([key, ...placeholders(zh[key])]).toEqual([key, ...placeholders(en[key])]);
    }
  });
});
