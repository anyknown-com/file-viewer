import { describe, expect, it, vi } from "vitest";
import { makeDoc } from "../test/make-doc";
import { renameLayer, setOpacity } from "./commands";
import { createDocStore } from "./store";

const label = "image.notice.unsupported";

describe("createDocStore", () => {
  it("records only labeled dispatches; undo goes back to the last recorded point", () => {
    const initial = makeDoc({ width: 4, height: 4, layers: [{}] });
    const id = initial.manifest.layers[0].id;
    const store = createDocStore(initial);
    store.dispatch(setOpacity(id, 0.8), label);
    const recorded = store.get();
    store.dispatch(setOpacity(id, 0.6));
    store.dispatch(setOpacity(id, 0.4));
    expect(store.get().manifest.layers[0].opacity).toBe(0.4);
    store.dispatch(setOpacity(id, 0.3), label);
    expect(store.undo()?.doc).toBe(recorded);
    expect(store.undo()?.doc).toBe(initial);
    expect(store.undo()).toBeNull();
  });

  it("is dirty after a change and clean again at the saved position", () => {
    const initial = makeDoc({ width: 4, height: 4, layers: [{}] });
    const id = initial.manifest.layers[0].id;
    const store = createDocStore(initial);
    expect(store.dirty()).toBe(false);
    store.dispatch(renameLayer(id, "a"), label);
    expect(store.dirty()).toBe(true);
    store.markSaved();
    expect(store.dirty()).toBe(false);
    store.dispatch(renameLayer(id, "b"), label);
    expect(store.dirty()).toBe(true);
    store.undo();
    expect(store.dirty()).toBe(false);
  });

  it("keeps edits made during a save unsaved", () => {
    const initial = makeDoc({ width: 4, height: 4, layers: [{}] });
    const id = initial.manifest.layers[0].id;
    const store = createDocStore(initial);
    store.dispatch(renameLayer(id, "a"), label);
    const at = store.position();
    store.dispatch(renameLayer(id, "b"), label);
    store.markSaved(at);
    expect(store.dirty()).toBe(true);
    store.undo();
    expect(store.dirty()).toBe(false);
  });

  it("notifies subscribers once per change", () => {
    const initial = makeDoc({ width: 4, height: 4, layers: [{}] });
    const id = initial.manifest.layers[0].id;
    const store = createDocStore(initial);
    const fn = vi.fn<() => void>();
    const off = store.subscribe(fn);
    store.dispatch(renameLayer(id, "a"), label);
    expect(fn).toHaveBeenCalledTimes(1);
    store.dispatch(setOpacity(id, 0.5));
    expect(fn).toHaveBeenCalledTimes(2);
    store.commit(label, store.get(), []);
    expect(fn).toHaveBeenCalledTimes(3);
    store.undo();
    expect(fn).toHaveBeenCalledTimes(4);
    store.redo();
    expect(fn).toHaveBeenCalledTimes(5);
    store.dispatch(renameLayer("missing", "x"), label);
    expect(fn).toHaveBeenCalledTimes(5);
    off();
    store.dispatch(renameLayer(id, "b"), label);
    expect(fn).toHaveBeenCalledTimes(5);
  });
});
