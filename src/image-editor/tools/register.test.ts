import { beforeEach, expect, it } from "vitest";
import { messageTables, resetRegistry } from "../registry";
import { selectPaintMessages } from "./messages";
import { registerSelectPaint } from "./register";

beforeEach(resetRegistry);

it("registers the select and paint messages", () => {
  registerSelectPaint();
  expect(messageTables()).toContain(selectPaintMessages);
});
