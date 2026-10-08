import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorApi, Selection, Session, ToolSpec } from "../api";
import { registerCore } from "../core";
import { createDocStore } from "../doc/store";
import { registerSelection, registerTool, resetRegistry, selectionProvider } from "../registry";
import { isMac } from "../shortcut";
import { makeDoc } from "../test/make-doc";
import { handleKey } from "./shortcuts";

// A stand-in EditorApi with the parts the core items use (no GL: pixelSize says "no texture").
function fakeApi() {
  const doc = makeDoc({ width: 4, height: 4, layers: [{}, {}] });
  const store = createDocStore(doc);
  let session: Session = {
    active: doc.manifest.activeLayerID ?? null,
    target: "image",
    tool: "",
    collapsed: new Set(),
    renderHidden: new Set(),
  };
  const api = {
    doc: store.get,
    session: () => session,
    setSession: (p: Partial<Session>) => (session = { ...session, ...p }),
    dispatch: store.dispatch,
    pixelSize: () => null,
    checkBudget: () => null,
    selection: (): Selection | null =>
      selectionProvider()?.get(api as unknown as EditorApi) ?? null,
    t: (key: string) => key,
  };
  return { api: api as unknown as EditorApi, store };
}

function key(k: string, opts: { mod?: boolean; shift?: boolean } = {}, target?: Element) {
  const mod = opts.mod === true;
  const e = new KeyboardEvent("keydown", {
    key: k,
    metaKey: isMac() && mod,
    ctrlKey: !isMac() && mod,
    shiftKey: opts.shift === true,
    bubbles: true,
  });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
}

const tool = (id: string, k: string, extra: Partial<ToolSpec> = {}): ToolSpec => ({
  id,
  key: k,
  label: "image.layers.new",
  icon: () => null,
  cursor: "default",
  ...extra,
});

const layerCount = (api: EditorApi) => api.doc().manifest.layers.length;

beforeEach(() => {
  resetRegistry();
  registerCore();
});
afterEach(resetRegistry);

describe("handleKey", () => {
  it("duplicates the active layer on Mod+J", () => {
    const { api } = fakeApi();
    expect(handleKey(key("j", { mod: true }), api)).toBe(true);
    expect(layerCount(api)).toBe(3);
  });

  it("leaves keys typed into an input alone", () => {
    const { api } = fakeApi();
    const input = document.createElement("input");
    expect(handleKey(key("j", { mod: true }, input), api)).toBe(false);
    expect(layerCount(api)).toBe(2);
  });

  it("lets the current tool eat a key before the menus", () => {
    const { api } = fakeApi();
    registerTool(tool("probe", "P", { onKeyDown: () => true }));
    api.setSession({ tool: "probe" });
    expect(handleKey(key("j", { mod: true }), api)).toBe(true);
    expect(layerCount(api)).toBe(2);
  });

  it("cycles the tools of one key with Shift", () => {
    const { api } = fakeApi();
    registerTool(tool("marquee", "M", { slot: "select" }));
    registerTool(tool("ellipse", "M", { slot: "select" }));
    handleKey(key("m"), api);
    expect(api.session().tool).toBe("marquee");
    handleKey(key("m"), api);
    expect(api.session().tool).toBe("marquee");
    handleKey(key("M", { shift: true }), api);
    expect(api.session().tool).toBe("ellipse");
    handleKey(key("M", { shift: true }), api);
    expect(api.session().tool).toBe("marquee");
  });

  it("clears the selection on Delete instead of deleting the layer", () => {
    const { api } = fakeApi();
    const clear = vi.fn<(api: EditorApi) => void>();
    registerSelection({ get: () => ({}) as Selection, clear });
    expect(handleKey(key("Delete"), api)).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(layerCount(api)).toBe(2);
  });

  it("deletes the layer when there is no selection", () => {
    const { api } = fakeApi();
    const clear = vi.fn<(api: EditorApi) => void>();
    registerSelection({ get: () => null, clear });
    handleKey(key("Delete"), api);
    expect(clear).not.toHaveBeenCalled();
    expect(layerCount(api)).toBe(1);
  });

  it("deletes the layer on Backspace when the provider cannot clear", () => {
    const { api } = fakeApi();
    registerSelection({ get: () => ({}) as Selection });
    handleKey(key("Backspace"), api);
    expect(layerCount(api)).toBe(1);
  });

  it("does not clear on Shift + Delete", () => {
    const { api } = fakeApi();
    const clear = vi.fn<(api: EditorApi) => void>();
    registerSelection({ get: () => ({}) as Selection, clear });
    handleKey(key("Delete", { shift: true }), api);
    expect(clear).not.toHaveBeenCalled();
  });

  it("registers the core items once however often it is called", () => {
    expect(() => registerCore()).not.toThrow();
  });
});
