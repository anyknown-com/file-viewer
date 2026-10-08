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

it("registers the select and paint tools, menus, overlay, thumbnail decor and provider once", () => {
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
  expect(menuItems("edit").map((m) => m.id)).toEqual(
    expect.arrayContaining([
      "edit.cut",
      "edit.copy",
      "edit.copyMerged",
      "edit.paste",
      "edit.fill",
      "edit.clear",
    ]),
  );
  expect(ids).toEqual(expect.arrayContaining(["paint.brush", "paint.eraser"]));
  expect(menuItems("hidden").map((m) => m.id)).toEqual(
    expect.arrayContaining(["paint.swapColors", "paint.defaultColors"]),
  );
  expect(overlays().map((o) => o.id)).toContain("select.ants");
  expect(layerDecors().map((d) => d.id)).toContain("select.thumbnailLoad");
  expect(selectionProvider()).toBe(provider);
  expect(() => registerSelectPaint()).toThrow("already registered");
});
