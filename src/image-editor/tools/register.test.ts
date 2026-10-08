import { beforeEach, expect, it } from "vitest";
import {
  layerDecors,
  menuItems,
  messageTables,
  overlays,
  resetRegistry,
  selectionProvider,
  tools,
} from "../registry";
import { selectPaintMessages } from "./messages";
import { registerSelectPaint } from "./register";
import { selectionProvider as provider } from "./select/provider";

beforeEach(resetRegistry);

it("registers the select and paint messages", () => {
  registerSelectPaint();
  expect(messageTables()).toContain(selectPaintMessages);
});

it("registers the select tools, menu, overlay, thumbnail decor and provider once", () => {
  registerSelectPaint();
  const ids = tools().map((t) => t.id);
  for (const id of [
    "select.rect",
    "select.ellipse",
    "select.lasso",
    "select.polygon",
    "select.wand",
  ]) {
    expect(ids).toContain(id);
  }
  expect(menuItems("select")).toHaveLength(8);
  expect(overlays().map((o) => o.id)).toContain("select.ants");
  expect(layerDecors().map((d) => d.id)).toContain("select.thumbnailLoad");
  expect(selectionProvider()).toBe(provider);
  expect(() => registerSelectPaint()).toThrow("already registered");
});
