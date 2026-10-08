import { expect, test } from "vitest";

test("jsdom provides DOM elements", () => {
  expect(document.createElement("div")).toBeInstanceOf(HTMLDivElement);
});

test("Blob works", () => {
  expect(new Blob(["a"]).size).toBe(1);
});
