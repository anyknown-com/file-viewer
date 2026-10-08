import { describe, expect, it } from "vitest";
import { initialEdit } from "./edit";
import { HISTORY_LIMIT, type History, historyReducer, initialHistory, isDirty } from "./history";

const edits = Array.from({ length: 205 }, (_, i) => initialEdit(i + 1));

function applyN(n: number): History {
  let h = initialHistory(edits[0]);
  for (let i = 1; i <= n; i++) h = historyReducer(h, { type: "apply", next: edits[i] });
  return h;
}

describe("history", () => {
  it("undo to the bottom then redo to the top returns the same present", () => {
    const top = applyN(5);
    let h = top;
    for (let i = 0; i < 5; i++) h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(edits[0]);
    for (let i = 0; i < 5; i++) h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(top.present);
    expect(h.future).toEqual([]);
  });

  it("keeps 200 steps and drops the oldest", () => {
    const h = applyN(201);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(edits[1]);
    expect(h.initial).toBe(edits[0]);
  });

  it("apply clears the future", () => {
    let h = applyN(3);
    h = historyReducer(h, { type: "undo" });
    expect(h.future).toHaveLength(1);
    h = historyReducer(h, { type: "apply", next: edits[10] });
    expect(h.future).toEqual([]);
  });

  it("isDirty is false after undoing back to initial", () => {
    let h = applyN(1);
    expect(isDirty(h)).toBe(true);
    h = historyReducer(h, { type: "undo" });
    expect(isDirty(h)).toBe(false);
  });

  it("undo and redo on empty stacks change nothing", () => {
    const h = initialHistory(edits[0]);
    expect(historyReducer(h, { type: "undo" })).toBe(h);
    expect(historyReducer(h, { type: "redo" })).toBe(h);
  });
});
