import { fireEvent } from "@testing-library/react";
import userEvents, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { registerAdjust } from "../adjust/install";
import { adjustmentRecord } from "../adjust/commands";
import { defaultAdjustment } from "../adjust/settings";
import type { EditorApi } from "../api";
import type { DocStore } from "../doc/store";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";

const [A, B, ADJ, GROUP] = ["LAYER-A", "LAYER-B", "LAYER-ADJ", "LAYER-GROUP"];
const STROKE = { enabled: true, size: 6, red: 1, green: 0, blue: 0, opacity: 1, inside: false };
let m: { api: EditorApi; store: DocStore; unmount(): void };
let user: UserEvent;

beforeAll(async () => {
  await page.viewport(1400, 900);
});
beforeEach(() => {
  resetRegistry();
  registerAdjust();
  user = userEvents.setup({ pointerEventsCheck: 0 });
});
afterEach(() => {
  m?.unmount();
  resetRegistry();
});

const mount = async (aEffects?: Record<string, unknown>) =>
  (m = await mountEditor(
    makeDoc({
      width: 8,
      height: 4,
      layers: [
        { id: A, name: "A", ...(aEffects ? { effects: aEffects } : {}) },
        { id: B, name: "B" },
        adjustmentRecord({
          id: ADJ,
          kind: "Invert",
          name: "Adj",
          width: 8,
          height: 4,
          settings: defaultAdjustment("Invert"),
          withMask: false,
        }),
        { id: GROUP, name: "Group", isGroup: true },
      ],
    } as never),
  ));
const layer = (id: string) => m.store.get().manifest.layers.find((l) => l.id === id);
const panel = () => document.querySelector<HTMLElement>(".fv-ie-adj-effects");
const row = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-layer-id="${id}"]`);
  if (!el) throw new Error(`no row ${id}`);
  return el;
};

async function select(id: string) {
  await user.click(row(id));
  await vi.waitFor(() => expect(m.api.session().active).toBe(id));
}

async function contextItem(id: string, name: string, click = true) {
  fireEvent.contextMenu(row(id));
  const item = await vi.waitFor(() => {
    const found = [...document.querySelectorAll<HTMLElement>("[role='menuitem']")].find(
      (el) =>
        el.textContent === name &&
        el.closest("[data-closed], [data-starting-style], [data-ending-style]") === null &&
        getComputedStyle(el).pointerEvents !== "none",
    );
    if (!found) throw new Error(`no menu item ${name}`);
    return found;
  });
  if (click) await user.click(item);
  return item;
}

const disabled = (el: HTMLElement) =>
  el.hasAttribute("data-disabled") || el.getAttribute("aria-disabled") === "true";

describe("layer effects UI", () => {
  it("shows the effects panel for plain layers only", async () => {
    await mount();
    await select(A);
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    await select(ADJ);
    await vi.waitFor(() => expect(panel()).toBeNull());
    await select(GROUP);
    await vi.waitFor(() => expect(panel()).toBeNull());
  });

  it("Effects… in the context menu focuses the first switch", async () => {
    await mount();
    await contextItem(A, "Effects…");
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(panel()?.querySelector("[role='switch']")),
    );
  });

  it("copies effects to another layer and clears them", async () => {
    await mount({ stroke: STROKE });
    await contextItem(A, "Copy effects");
    await select(B);
    await contextItem(B, "Paste effects");
    expect(layer(B)?.effects).toEqual(layer(A)?.effects);
    await contextItem(B, "Clear effects");
    expect(layer(B)).toBeDefined();
    expect("effects" in (layer(B) ?? {})).toBe(false);
  });

  it("shows fx on a layer with effects, even when all are disabled", async () => {
    await mount({ stroke: { ...STROKE, enabled: false } });
    expect(row(A).querySelector("button[aria-label='Effects…']")).not.toBeNull();
    expect(row(B).querySelector("button[aria-label='Effects…']")).toBeNull();
  });

  it("disables the effects items on an adjustment layer", async () => {
    await mount();
    await select(ADJ);
    for (const name of ["Effects…", "Copy effects", "Paste effects", "Clear effects"]) {
      expect(disabled(await contextItem(ADJ, name, false))).toBe(true);
      await user.keyboard("{Escape}");
    }
  });
});
