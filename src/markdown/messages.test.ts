import { describe, expect, it } from "vitest";
import { translate } from "../i18n/messages";
import { markdownMessages } from "./messages";

describe("markdownMessages", () => {
  it("has the same keys in en and zh-TW, all prefixed", () => {
    expect(Object.keys(markdownMessages["zh-TW"]).sort()).toEqual(
      Object.keys(markdownMessages.en).sort(),
    );
    for (const k of Object.keys(markdownMessages.en)) expect(k.startsWith("markdown.")).toBe(true);
  });

  it("fills placeholders", () => {
    expect(translate(markdownMessages, "zh-TW", {}, "markdown.image", { alt: "x" })).toBe(
      "[圖片：x]",
    );
  });
});
