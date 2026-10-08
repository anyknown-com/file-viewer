import { expect, it } from "vitest";
import { parseRoute } from "./routes";

it("routes the empty hash and #/ home", () => {
  expect(parseRoute("")).toEqual({ page: "home" });
  expect(parseRoute("#/")).toEqual({ page: "home" });
});

it("routes anything else to not-found", () => {
  expect(parseRoute("#/nope")).toEqual({ page: "not-found" });
});

it("routes #/guide/<key> to the guide page", () => {
  expect(parseRoute("#/guide/connect")).toEqual({ page: "guide", key: "connect" });
});
