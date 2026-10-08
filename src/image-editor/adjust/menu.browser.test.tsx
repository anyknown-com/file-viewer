import { fireEvent } from "@testing-library/react";
import userEvents, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { EditorApi, Selection } from "../api";
import type { DocStore } from "../doc/store";
import { registerSelection, resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";
import { registerAdjust } from "./install";

const BASE = "BASE-LAYER";
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

const mount = async () =>
  (m = await mountEditor(makeDoc({ width: 8, height: 4, layers: [{ id: BASE, name: "Base" }] })));
const layers = () => m.store.get().manifest.layers;
const panel = () => document.querySelector<HTMLElement>(".fv-ie-adj-panel");

async function addFromMenu(name: string) {
  const trigger = document.querySelector<HTMLElement>("[aria-label='New layer…']");
  if (!trigger) throw new Error("no New layer… trigger");
  await user.click(trigger);
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
  await user.click(item);
}

describe("adjustment layer menu", () => {
  it("adds a layer, shows its panel, and the badge selects it again", async () => {
    await mount();
    await addFromMenu("Exposure");
    expect(layers()).toHaveLength(2);
    const added = layers()[1];
    expect(added?.adjustment?.kind).toBe("Exposure");
    expect(m.api.session().active).toBe(added?.id);
    await vi.waitFor(() => expect(panel()?.querySelector("h3")?.textContent).toBe("Exposure"));

    const baseRow = document.querySelector<HTMLElement>(`[data-layer-id="${BASE}"]`);
    if (!baseRow) throw new Error("no base row");
    await user.click(baseRow);
    await vi.waitFor(() => expect(panel()).toBeNull());

    const badge = document.querySelector<HTMLElement>(
      `[data-layer-id="${added?.id}"] button[aria-label="Exposure"]`,
    );
    if (!badge) throw new Error("no badge");
    fireEvent.click(badge);
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    expect(m.api.session().active).toBe(added?.id);

    m.store.undo();
    await vi.waitFor(() => expect(layers()).toHaveLength(1));
  });

  it("uses the selection as the mask, in one undo step", async () => {
    const left = new Uint8Array(8 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) left[y * 8 + x] = 255;
    const selection = {
      version: 1,
      texture: null,
      bounds: { x: 0, y: 0, width: 4, height: 4 },
      read: () => left,
    } as unknown as Selection;
    registerSelection({ get: () => selection });
    await mount();
    await addFromMenu("Exposure");
    const added = layers()[1];
    expect(added?.maskFile).toBeDefined();
    const mask = m.api.readRegion(added?.id ?? "", "mask", { x: 0, y: 0, width: 8, height: 4 });
    expect(mask[0]).toBe(255);
    expect(mask[7]).toBe(0);
    m.store.undo();
    await vi.waitFor(() => expect(layers()).toHaveLength(1));
  });
});
