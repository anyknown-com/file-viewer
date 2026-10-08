import { describe, expect, it } from "vitest";
import type { Doc, LayerResize, PixelTile } from "../api";
import { UNDO_MAX_BYTES, UNDO_MAX_STEPS } from "../limits";
import { makeDoc } from "../test/make-doc";
import { createHistory, type Step } from "./history";

const label = "image.notice.unsupported";

function docs(n: number): Doc[] {
  const first = makeDoc({ width: 2, height: 2, layers: [{}] });
  return Array.from({ length: n }, (_, i) => ({
    ...first,
    manifest: { ...first.manifest, width: i + 1 },
  }));
}

// One buffer for before and after: history counts both, the test allocates once.
function tile(bytes: number): PixelTile {
  const data = new Uint8Array(bytes);
  return {
    layer: "L",
    target: "image",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    before: data,
    after: data,
  };
}

function resize(n: number): LayerResize {
  const data = new Uint8Array(n);
  return {
    layer: "L",
    target: "mask",
    before: { width: 1, height: 1, data },
    after: { width: 1, height: 1, data },
  };
}

function step(doc: Doc, extra: Partial<Step> = {}): Step {
  return { label, doc, tiles: [], resizes: [], ...extra };
}

describe("createHistory", () => {
  it("undoes to the start and redoes back to the same Doc objects", () => {
    const [initial, a, b, c] = docs(4);
    const h = createHistory(initial);
    for (const d of [a, b, c]) h.record(step(d));
    expect(h.undo()?.doc).toBe(b);
    expect(h.undo()?.doc).toBe(a);
    expect(h.undo()?.doc).toBe(initial);
    expect(h.undo()).toBeNull();
    expect(h.canUndo()).toBe(false);
    expect(h.redo()?.doc).toBe(a);
    expect(h.redo()?.doc).toBe(b);
    expect(h.redo()?.doc).toBe(c);
    expect(h.redo()).toBeNull();
  });

  it("drops the oldest step at step 101", () => {
    const all = docs(UNDO_MAX_STEPS + 2);
    const h = createHistory(all[0]);
    for (const d of all.slice(1)) h.record(step(d));
    let last: Doc | undefined;
    let count = 0;
    for (let r = h.undo(); r; r = h.undo()) {
      last = r.doc;
      count++;
    }
    expect(count).toBe(UNDO_MAX_STEPS);
    expect(last).toBe(all[1]);
  });

  it("drops the oldest steps once tiles pass 256 MB", () => {
    const [initial, a, b, c] = docs(4);
    const h = createHistory(initial);
    const half = UNDO_MAX_BYTES / 4; // before + after = half the limit per step
    const shared = tile(half);
    h.record(step(a, { tiles: [shared] }));
    h.record(step(b, { tiles: [shared] }));
    expect(h.bytes()).toBe(UNDO_MAX_BYTES);
    h.record(step(c, { tiles: [tile(1)] }));
    expect(h.bytes()).toBe(UNDO_MAX_BYTES / 2 + 2);
    expect(h.undo()?.doc).toBe(b);
    expect(h.undo()?.doc).toBe(a);
    expect(h.undo()).toBeNull();
  });

  it("counts resize bytes toward the limit", () => {
    const [initial, a, b] = docs(3);
    const h = createHistory(initial);
    h.record(step(a, { resizes: [resize(UNDO_MAX_BYTES / 2)] }));
    expect(h.bytes()).toBe(UNDO_MAX_BYTES);
    h.record(step(b, { resizes: [resize(1)] }));
    expect(h.bytes()).toBe(2);
    expect(h.undo()?.doc).toBe(a);
    expect(h.undo()).toBeNull();
  });

  it("returns the step's tiles and resizes as before on undo and after on redo", () => {
    const [initial, a] = docs(2);
    const h = createHistory(initial);
    const t = tile(4);
    const r: LayerResize = {
      layer: "L",
      target: "image",
      before: { width: 1, height: 1, data: new Uint8Array(4) },
    };
    h.record(step(a, { tiles: [t], resizes: [r] }));
    expect(h.undo()).toEqual({
      doc: initial,
      tiles: [{ tile: t, use: "before" }],
      resizes: [{ resize: r, use: "before" }],
    });
    expect(h.redo()).toEqual({
      doc: a,
      tiles: [{ tile: t, use: "after" }],
      resizes: [{ resize: r, use: "after" }],
    });
  });

  it("cannot redo after a new step", () => {
    const [initial, a, b, c] = docs(4);
    const h = createHistory(initial);
    h.record(step(a));
    h.record(step(b));
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.record(step(c));
    expect(h.canRedo()).toBe(false);
    expect(h.redo()).toBeNull();
    expect(h.undo()?.doc).toBe(a);
  });

  it("gives every recorded state its own position", () => {
    const [initial, a, b, c] = docs(4);
    const h = createHistory(initial);
    const start = h.position();
    h.record(step(a));
    h.record(step(b));
    const atB = h.position();
    h.undo();
    h.record(step(c));
    expect(h.position()).not.toBe(atB);
    h.undo();
    h.undo();
    expect(h.position()).toBe(start);
  });
});
