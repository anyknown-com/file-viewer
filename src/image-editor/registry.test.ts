import { beforeEach, describe, expect, it } from "vitest";
import type { MessageTable } from "../i18n/messages";
import type { AdjustmentHooks, EditorApi, MessageKey, MenuItemSpec, ToolSpec } from "./api";
import {
  adjustment,
  effects,
  layerDecors,
  menuItems,
  messageTables,
  overlays,
  propertyPanels,
  registerAdjustment,
  registerEffects,
  registerLayerDecor,
  registerMenuItem,
  registerMessages,
  registerOverlay,
  registerPropertyPanel,
  registerSelection,
  registerSetup,
  registerTool,
  resetRegistry,
  selectionProvider,
  setups,
  tools,
} from "./registry";

const label = "common.close" as MessageKey;
const Icon = () => null;

function tool(id: string, key: string): ToolSpec {
  return { id, key, label, icon: Icon, cursor: "default" };
}

function item(id: string, shortcut?: string, order?: number): MenuItemSpec {
  return { id, menu: "edit", label, shortcut, order, run: () => {} };
}

function table(key: string): MessageTable<string> {
  return { en: { [key]: "x" }, "zh-TW": { [key]: "x" } };
}

function panel(id: string, order?: number) {
  return { id, order, when: () => true, component: Icon };
}

const f = (_api: EditorApi) => {};
const g = (_api: EditorApi) => {};
const reach = () => 0;
const lut: AdjustmentHooks["lut"] = () => ({ dims: 1, texture: {} as WebGLTexture });
const pass: AdjustmentHooks["pass"] = () => {};

beforeEach(resetRegistry);

describe("tools", () => {
  it("throws on a duplicate id", () => {
    registerTool(tool("move", "V"));
    expect(() => registerTool(tool("move", "M"))).toThrow(/already registered/);
  });

  it("allows two tools on one key (Shift cycles them)", () => {
    registerTool(tool("move", "V"));
    registerTool(tool("artboard", "V"));
    expect(tools().map((t) => t.id)).toEqual(["move", "artboard"]);
  });

  it("throws when the key clashes with a menu shortcut", () => {
    registerMenuItem(item("select.lasso", "L"));
    expect(() => registerTool(tool("lasso", "L"))).toThrow(/clashes/);
  });

  it("throws when a menu shortcut takes a tool key", () => {
    registerTool(tool("move", "V"));
    expect(() => registerMenuItem(item("x", "Shift+V"))).toThrow(/clashes/);
    expect(() => registerMenuItem(item("paste", "Mod+V"))).not.toThrow();
  });
});

describe("menu items", () => {
  it("throws on a duplicate id or shortcut", () => {
    registerMenuItem(item("undo", "Mod+Z"));
    expect(() => registerMenuItem(item("undo"))).toThrow(/already registered/);
    expect(() => registerMenuItem(item("other", "Mod+z"))).toThrow(/already used/);
    expect(() => registerMenuItem(item("redo", "Mod+Shift+Z"))).not.toThrow();
  });

  it("sorts by order, then registration order", () => {
    registerMenuItem(item("c", undefined, 2));
    registerMenuItem(item("a"));
    registerMenuItem(item("b", undefined, -1));
    registerMenuItem(item("d"));
    registerMenuItem({ ...item("other"), menu: "image" });
    expect(menuItems("edit").map((m) => m.id)).toEqual(["b", "a", "d", "c"]);
    expect(menuItems("image").map((m) => m.id)).toEqual(["other"]);
  });
});

describe("adjustments and effects", () => {
  it("needs exactly one of lut and pass, once per kind", () => {
    expect(() => registerAdjustment("Levels", { lut, pass, reach })).toThrow(/exactly one/);
    expect(() => registerAdjustment("Levels", { reach })).toThrow(/exactly one/);
    registerAdjustment("Levels", { lut, reach });
    expect(() => registerAdjustment("Levels", { pass, reach })).toThrow(/already registered/);
    expect(adjustment("Levels")?.lut).toBe(lut);
  });

  it("registers effects once", () => {
    const hooks = { pass: () => {}, reach };
    registerEffects(hooks);
    expect(effects()).toBe(hooks);
    expect(() => registerEffects(hooks)).toThrow(/already registered/);
  });
});

describe("messages, panels, selection and setups", () => {
  it("keeps message tables in order and skips the same object", () => {
    const a = table("image.a");
    const b = table("image.b");
    registerMessages(a);
    registerMessages(b);
    registerMessages(a);
    expect(messageTables()).toEqual([a, b]);
    expect(messageTables()[0]).toBe(a);
  });

  it("throws on a duplicate panel id and sorts panels by order", () => {
    registerPropertyPanel(panel("effects", 10));
    registerPropertyPanel(panel("adjust"));
    registerPropertyPanel(panel("info"));
    expect(() => registerPropertyPanel(panel("adjust", 1))).toThrow(/already registered/);
    expect(propertyPanels().map((p) => p.id)).toEqual(["adjust", "info", "effects"]);
  });

  it("allows one selection provider", () => {
    const p = { get: () => null };
    registerSelection(p);
    expect(selectionProvider()).toBe(p);
    expect(() => registerSelection({ get: () => null })).toThrow(/already registered/);
  });

  it("skips the same setup function", () => {
    registerSetup(f);
    registerSetup(g);
    registerSetup(f);
    expect(setups()).toEqual([f, g]);
  });
});

it("resetRegistry empties every table", () => {
  registerTool(tool("move", "V"));
  registerMenuItem(item("undo", "Mod+Z"));
  registerAdjustment("Levels", { lut, reach });
  registerEffects({ pass: () => {}, reach });
  registerLayerDecor({ id: "fx" });
  registerOverlay({ id: "ants", draw: () => {} });
  registerMessages(table("image.a"));
  registerPropertyPanel({ id: "p", when: () => true, component: Icon });
  registerSelection({ get: () => null });
  registerSetup(() => {});
  resetRegistry();
  expect(tools()).toEqual([]);
  expect(menuItems("edit")).toEqual([]);
  expect(adjustment("Levels")).toBeUndefined();
  expect(effects()).toBeUndefined();
  expect(layerDecors()).toEqual([]);
  expect(overlays()).toEqual([]);
  expect(messageTables()).toEqual([]);
  expect(propertyPanels()).toEqual([]);
  expect(selectionProvider()).toBeUndefined();
  expect(setups()).toEqual([]);
  registerTool(tool("move", "V"));
  registerMenuItem(item("undo", "Mod+Z"));
});
