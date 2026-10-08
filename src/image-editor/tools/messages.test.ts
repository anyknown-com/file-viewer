import { expect, it } from "vitest";
import { selectPaintMessages } from "./messages";

const { en, "zh-TW": zh } = selectPaintMessages;

it("has the same keys in both languages", () => {
  expect(Object.keys(zh).toSorted()).toEqual(Object.keys(en).toSorted());
});

it("prefixes every key with image.select. or image.paint.", () => {
  for (const key of Object.keys(en)) expect(key).toMatch(/^image\.(select|paint)\./);
});

it("allows an empty string only for redactRetention", () => {
  for (const table of [en, zh]) {
    const empty = Object.entries(table)
      .filter(([, value]) => value === "")
      .map(([key]) => key);
    expect(empty).toEqual(["image.paint.redactRetention"]);
  }
});
