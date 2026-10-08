import { beforeEach, expect, it } from "vitest";
import { commonMessages, translate } from "../i18n/messages";
import type { MessageKey } from "./api";
import { labelOf, labelTable } from "./labels";
import { registerMessages, resetRegistry } from "./registry";

const fake = {
  en: { "image.select.all": "All", "common.cancel": "Fake cancel" },
  "zh-TW": { "image.select.all": "全部", "common.cancel": "假的取消" },
};

beforeEach(() => {
  resetRegistry();
  registerMessages(fake);
});

it("translates a key from a registered table", () => {
  expect(labelOf("zh-TW", {}, "image.select.all" as MessageKey)).toBe("全部");
  expect(labelOf("en", {}, "image.select.all" as MessageKey)).toBe("All");
});

it("keeps the first table that has a key", () => {
  expect(labelOf("zh-TW", {}, "common.cancel")).toBe(commonMessages["zh-TW"]["common.cancel"]);
});

it("lets host overrides win", () => {
  expect(labelOf("zh-TW", { "image.select.all": "全選" }, "image.select.all" as MessageKey)).toBe(
    "全選",
  );
});

it("translates image keys and fills vars", () => {
  expect(labelOf("en", {}, "image.notice.unsupported")).toMatch(/adjustment or effect/);
  const table = { en: { "image.x.n": "{n} layers" }, "zh-TW": { "image.x.n": "{n} 層" } };
  registerMessages(table);
  expect(labelOf("zh-TW", {}, "image.x.n" as MessageKey, { n: 3 })).toBe("3 層");
});

it("falls back like translate for a key no table has", () => {
  const key = "image.none" as MessageKey;
  expect(labelOf("en", {}, key)).toBe(translate(labelTable(), "en", {}, key));
  expect(labelOf("en", { "image.none": "Host text" }, key)).toBe("Host text");
});

it("rebuilds after the registered tables change", () => {
  expect(labelTable().en["image.select.all"]).toBe("All");
  resetRegistry();
  registerMessages({ en: { "image.other": "Other" }, "zh-TW": { "image.other": "其他" } });
  expect(labelTable().en["image.select.all"]).toBeUndefined();
  expect(labelTable().en["image.other"]).toBe("Other");
});
