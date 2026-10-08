import { describe, expect, it } from "vitest";
import { en } from "./en";
import { commonMessages, format, translate } from "./messages";
import { zhTW } from "./zh-tw";

const codes = [
  "unsupported",
  "too_large",
  "read_failed",
  "decode_failed",
  "codec_unsupported",
  "webgl_unavailable",
  "webcodecs_unavailable",
  "output_too_large",
  "save_failed",
  "render_failed",
];

describe("format", () => {
  it("fills named vars", () => {
    expect(format("Hi {name}", { name: "A" })).toBe("Hi A");
  });
  it("keeps placeholders without a value", () => {
    expect(format("{n} of {total}", { n: 1 })).toBe("1 of {total}");
  });
  it("returns plain strings unchanged", () => {
    expect(format("plain")).toBe("plain");
  });
});

describe("translate", () => {
  it("uses the locale table", () => {
    expect(translate(commonMessages, "zh-TW", {}, "common.save")).toBe("儲存");
  });
  it("prefers overrides", () => {
    expect(translate(commonMessages, "zh-TW", { "common.save": "Store" }, "common.save")).toBe(
      "Store",
    );
  });
});

describe("tables", () => {
  it("en and zh-TW have the same keys", () => {
    expect(new Set(Object.keys(en))).toEqual(new Set(Object.keys(zhTW)));
  });
  it("has an error key for every code", () => {
    for (const c of codes) expect(en).toHaveProperty(`error.${c}`);
  });
});
