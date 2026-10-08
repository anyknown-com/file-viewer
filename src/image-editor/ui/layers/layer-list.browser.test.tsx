import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import userEvents, { type UserEvent } from "@testing-library/user-event";
import { page } from "vitest/browser";
import type { Doc, EditorApi, Layer, LayerId, PixelTarget } from "../../api";
import type { DocStore } from "../../doc/store";
import { subtreeRange } from "../../doc/tree";
import { registerLayerDecor, registerPropertyPanel, resetRegistry } from "../../registry";
import { isMac } from "../../shortcut";
import { makeDoc } from "../../test/make-doc";
import { mountEditor } from "../../test/mount-editor";

const uid = () => crypto.randomUUID().toUpperCase();
const ids = { a: uid(), b: uid(), f: uid(), c: uid() };

// Three layers and a folder; Gamma sits in the folder. Rows top first: Stack, Gamma, Beta, Alpha.
// (Not "Folder": that is the name "Group layers" gives its new folder.)
function doc(extra: Partial<Record<keyof typeof ids, Partial<Layer>>> = {}): Doc {
  return makeDoc({
    width: 8,
    height: 8,
    layers: [
      { id: ids.a, name: "Alpha", ...extra.a },
      { id: ids.b, name: "Beta", ...extra.b },
      { id: ids.f, name: "Stack", isGroup: true, ...extra.f },
      { id: ids.c, name: "Gamma", parentID: ids.f, ...extra.c },
    ],
  });
}

let m: { api: EditorApi; store: DocStore; unmount(): void };
// In-page events: driven clicks wait on actionability, which stalls while other test files share the
// browser. No pointer-events check: Base UI's select popup has none while it opens.
let user: UserEvent;
const mount = async (d: Doc = doc()) => (m = await mountEditor(d));

beforeAll(async () => {
  await page.viewport(1400, 900);
});
beforeEach(() => {
  resetRegistry();
  user = userEvents.setup({ pointerEventsCheck: 0 });
});
afterEach(() => {
  m?.unmount();
  resetRegistry();
});

const row = (id: LayerId) => {
  const el = document.querySelector<HTMLElement>(`[data-layer-id="${id}"]`);
  if (!el) throw new Error(`no row for ${id}`);
  return el;
};
const layer = (id: LayerId) => m.store.get().manifest.layers.find((l) => l.id === id);
const byLabel = (name: string) => {
  const el = document.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (!el) throw new Error(`nothing labelled ${name}`);
  return el;
};

/** Clicks the top bar button once React has enabled it (faster than a driven click). */
async function press(name: "Undo" | "Redo") {
  const button = byLabel(name) as HTMLButtonElement;
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  button.click();
}

async function select(id: LayerId) {
  await user.click(row(id));
  await vi.waitFor(() => expect(m.api.session().active).toBe(id));
}

/**
 * The element of `role` named `name` once it takes clicks. A menu that is closing keeps its items
 * until its exit animation ends, and a popup that is opening ignores the pointer for a moment;
 * both last long while other test files share the browser.
 */
function ready(role: "menuitem" | "option", name: string): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const found = [...document.querySelectorAll<HTMLElement>(`[role='${role}']`)].find(
      (el) =>
        el.textContent === name &&
        el.closest("[data-closed], [data-starting-style], [data-ending-style]") === null &&
        getComputedStyle(el).pointerEvents !== "none",
    );
    if (!found) throw new Error(`no ${role} ${name} ready`);
    return found;
  });
}

async function contextItem(id: LayerId, name: string) {
  fireEvent.contextMenu(row(id));
  await user.click(await ready("menuitem", name));
}

/**
 * `act` records one step: undo brings back the document before it, redo the one after. Unless
 * `keep`, a last undo leaves the document as it was before.
 */
async function oneStep(act: () => Promise<void>, keep = false) {
  const before = m.store.get();
  await act();
  await vi.waitFor(() => expect(m.store.get()).not.toBe(before));
  const after = m.store.get();
  await press("Undo");
  expect(m.store.get()).toBe(before);
  await press("Redo");
  expect(m.store.get()).toBe(after);
  if (!keep) await press("Undo");
}

function pointer(type: string, target: EventTarget, x: number, y: number, alt = false) {
  const init = { clientX: x, clientY: y, button: 0, pointerId: 1, altKey: alt, bubbles: true };
  target.dispatchEvent(new PointerEvent(type, init));
}

function drag(id: LayerId, to: LayerId, at: number) {
  const from = row(id).getBoundingClientRect();
  const r = row(to).getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height * at;
  pointer("pointerdown", row(id), from.left + from.width / 2, from.top + from.height / 2);
  pointer("pointermove", document, x, y);
  pointer("pointermove", document, x, y + 1);
  pointer("pointerup", document, x, y + 1);
}

/** Every folder's contents sit right after it in the layer array. */
function contiguous(d: Doc, folder: LayerId) {
  const [start, end] = subtreeRange(d.manifest, folder);
  const inside = d.manifest.layers.slice(start + 1, end);
  const kids = d.manifest.layers.filter((l) => l.parentID === folder);
  expect(inside.filter((l) => l.parentID === folder)).toEqual(kids);
}

const panel = () => document.querySelector(".probe-panel");

describe("LayerList", () => {
  it("records one step for duplicating and deleting from the context menu", async () => {
    await mount();
    await oneStep(() => contextItem(ids.b, "Duplicate layer"));
    await oneStep(() => contextItem(ids.b, "Delete layer"));
    expect(m.store.get().manifest.layers).toHaveLength(4);
  });

  it("records one step for grouping and ungrouping from the context menu", async () => {
    await mount();
    await oneStep(() => contextItem(ids.a, "Group layers"));
    await oneStep(() => contextItem(ids.f, "Ungroup"));
    expect(m.store.get().manifest.layers).toHaveLength(4);
  });

  it("records one step for creating and releasing a clipping mask", async () => {
    await mount();
    await oneStep(() => contextItem(ids.b, "Create clipping mask"), true);
    await oneStep(() => contextItem(ids.b, "Release clipping mask"));
    expect(layer(ids.b)?.maskSourceID).toBe(ids.a);
  });

  it("records one step for each mask item of the context menu", async () => {
    await mount();
    await select(ids.a);
    await oneStep(() => user.click(byLabel("Add mask")), true);
    await oneStep(() => contextItem(ids.a, "Disable mask"), true);
    await oneStep(() => contextItem(ids.a, "Enable mask"), true);
    await oneStep(() => contextItem(ids.a, "Invert mask"), true);
    expect(m.api.readRegion(ids.a, "mask", { x: 0, y: 0, width: 1, height: 1 })[0]).toBe(0);
    await oneStep(() => contextItem(ids.a, "Unlink mask"), true);
    await oneStep(() => contextItem(ids.a, "Link mask"), true);
    await oneStep(() => contextItem(ids.a, "Delete mask"));
  });

  it("reorders by drag and drops into a folder as one undo step", async () => {
    await mount();
    await oneStep(async () => drag(ids.a, ids.f, 0.5), true);
    expect(layer(ids.a)?.parentID).toBe(ids.f);
    contiguous(m.store.get(), ids.f);
    await vi.waitFor(() => row(ids.b));
    await oneStep(async () => drag(ids.b, ids.f, 0.1), true);
    expect(layer(ids.b)?.parentID).toBeUndefined();
    const roots = m.store.get().manifest.layers.filter((l) => l.parentID === undefined);
    expect(roots.map((l) => l.id)).toEqual([ids.f, ids.b]);
    contiguous(m.store.get(), ids.f);
  });

  it("clips with Alt on the line between two rows and releases the same way", async () => {
    await mount();
    const altClick = () => {
      const r = row(ids.b).getBoundingClientRect();
      pointer("pointerdown", row(ids.b), r.left + 40, r.bottom - 1, true);
    };
    altClick();
    expect(layer(ids.b)?.maskSourceID).toBe(ids.a);
    await vi.waitFor(() => row(ids.b));
    altClick();
    expect(layer(ids.b)?.maskSourceID).toBeUndefined();
  });

  it("moves, renames and cancels from the keyboard", async () => {
    await mount();
    for (let i = 0; i < 40 && document.activeElement?.getAttribute("role") !== "treeitem"; i++) {
      // oxlint-disable-next-line no-await-in-loop -- Tab presses happen one after another.
      await user.tab();
    }
    expect(document.activeElement).toBe(row(ids.c));
    await user.keyboard("{ArrowDown}");
    expect(m.api.session().active).toBe(ids.b);
    expect(document.activeElement).toBe(row(ids.b));
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe("INPUT"));
    // The input opens with the name selected, so typing replaces it.
    await user.keyboard("Renamed{Enter}");
    await vi.waitFor(() => expect(layer(ids.b)?.name).toBe("Renamed"));
    await vi.waitFor(() => expect(document.activeElement).toBe(row(ids.b)));
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe("INPUT"));
    await user.keyboard("zzz{Escape}");
    await vi.waitFor(() => expect(document.querySelector(".fv-ie-rename")).toBeNull());
    expect(layer(ids.b)?.name).toBe("Renamed");
    await user.keyboard(" ");
    expect(layer(ids.b)?.isVisible).toBe(false);
  });

  it("changes the picture when the blend mode becomes Multiply", async () => {
    await mount();
    const px = { x: 0, y: 0, width: 1, height: 1 };
    const before = m.api.readComposite(px);
    await user.click(byLabel("Blend mode"));
    const multiply = await ready("option", "Multiply");
    await user.click(multiply);
    expect(layer(ids.c)?.blendMode).toBe("Multiply");
    expect([...m.api.readComposite(px)]).not.toEqual([...before]);
  });

  it("previews opacity while typing and records one step on commit", async () => {
    await mount();
    const start = m.store.get();
    const position = m.store.position();
    const input = byLabel("Opacity") as HTMLInputElement;
    await user.tripleClick(input);
    await user.keyboard("40");
    await vi.waitFor(() => expect(layer(ids.c)?.opacity).toBe(0.4));
    expect(m.store.position()).toBe(position);
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(m.store.position()).not.toBe(position));
    await user.click(byLabel("Undo"));
    expect(m.store.get()).toBe(start);
  });

  it("shows a registered decor's thumbnail and badge", async () => {
    registerLayerDecor({
      id: "probe",
      thumbnail: (l) => <i className="probe-thumb">{l.name}</i>,
      badge: (l) => (l.id === ids.b ? <i className="probe-badge">fx</i> : null),
    });
    await mount();
    expect(row(ids.a).querySelector(".probe-thumb")).not.toBeNull();
    expect(row(ids.a).querySelector("canvas")).toBeNull();
    expect(row(ids.b).querySelector(".probe-badge")?.textContent).toBe("fx");
    expect(row(ids.a).querySelector(".probe-badge")).toBeNull();
  });

  it("lets a decor take a ⌘-click on a thumbnail before the default", async () => {
    let eat = true;
    const seen: { target: PixelTarget; mod: boolean }[] = [];
    registerLayerDecor({
      id: "probe",
      onThumbnailClick: (_l, target, mods) => {
        seen.push({ target, mod: mods.mod });
        return eat;
      },
    });
    await mount(doc({ a: { maskFile: `${ids.a}.mask.png` } }));
    await select(ids.a);
    const mask = row(ids.a).querySelector<HTMLElement>("[data-thumb='mask']");
    if (!mask) throw new Error("no mask thumbnail");
    const mod = isMac() ? "Meta" : "Control";
    await user.keyboard(`{${mod}>}`);
    await user.click(mask);
    await user.keyboard(`{/${mod}}`);
    expect(seen).toEqual([{ target: "mask", mod: true }]);
    expect(m.api.session().target).toBe("image");
    eat = false;
    await user.click(mask);
    expect(m.api.session().target).toBe("mask");
  });

  it("shows a property panel only for the layers it wants, with fresh records", async () => {
    registerPropertyPanel({
      id: "probe",
      when: (l) => l.id === ids.b,
      component: ({ layer: l }) => <p className="probe-panel">{l.name}</p>,
    });
    await mount();
    await select(ids.b);
    await vi.waitFor(() => expect(panel()?.textContent).toBe("Beta"));
    await select(ids.a);
    await vi.waitFor(() => expect(panel()).toBeNull());
    await select(ids.b);
    await user.dblClick(row(ids.b).querySelector(".fv-ie-layer-name") as HTMLElement);
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe("INPUT"));
    await user.keyboard("Bravo{Enter}");
    await vi.waitFor(() => expect(panel()?.textContent).toBe("Bravo"));
    await user.click(byLabel("Undo"));
    await vi.waitFor(() => expect(panel()?.textContent).toBe("Beta"));
  });
});
