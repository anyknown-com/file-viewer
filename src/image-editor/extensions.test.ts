import { expect, it } from "vitest";
import { installExtensions } from "./extensions";
import { resetRegistry, tools } from "./registry";

// Registering twice throws (duplicate ids), so a second install must not run the
// register functions again.
it("runs the register functions once", () => {
  resetRegistry();
  installExtensions();
  const first = tools();
  expect(() => installExtensions()).not.toThrow();
  expect(tools()).toEqual(first);
});
