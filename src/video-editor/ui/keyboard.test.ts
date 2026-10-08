import { describe, expect, it } from "vitest";
import { type KeyInput, keyAction } from "./keyboard";

const key = (k: string, code: string, over: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  code,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  target: document.body,
  ...over,
});

describe("keyAction", () => {
  it.each([
    [key(" ", "Space"), "toggle"],
    [key("k", "KeyK"), "pause"],
    [key("l", "KeyL"), "play"],
    [key("j", "KeyJ"), "back5"],
    [key("ArrowLeft", "ArrowLeft"), "prevFrame"],
    [key("ArrowRight", "ArrowRight"), "nextFrame"],
    [key("s", "KeyS"), "split"],
    [key("Delete", "Delete"), "delete"],
    [key("Backspace", "Backspace"), "delete"],
    [key("Backspace", "Backspace", { shiftKey: true }), "rippleDelete"],
    [key("z", "KeyZ", { metaKey: true }), "undo"],
    [key("z", "KeyZ", { ctrlKey: true }), "undo"],
    [key("z", "KeyZ", { metaKey: true, shiftKey: true }), "redo"],
    [key("Z", "KeyZ", { ctrlKey: true, shiftKey: true }), "redo"],
    [key("y", "KeyY", { ctrlKey: true }), "redo"],
    [key("Escape", "Escape"), "deselect"],
    [key("x", "KeyX"), null],
    [key("s", "KeyS", { metaKey: true }), null],
  ])("maps %o to %s", (input, action) => {
    expect(keyAction(input)).toBe(action);
  });

  it("maps Shift+Delete to rippleDelete", () => {
    expect(keyAction(key("Delete", "Delete", { shiftKey: true }))).toBe("rippleDelete");
  });

  it("ignores keys typed into text fields", () => {
    const textarea = document.createElement("textarea");
    expect(keyAction(key("s", "KeyS", { target: textarea }))).toBeNull();
    for (const tag of ["input", "select"]) {
      const el = document.createElement(tag);
      expect(keyAction(key("Delete", "Delete", { target: el }))).toBeNull();
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "");
    const inner = editable.appendChild(document.createElement("span"));
    expect(keyAction(key(" ", "Space", { target: inner }))).toBeNull();
  });

  it("leaves Space to a focused button", () => {
    const button = document.createElement("button");
    expect(keyAction(key(" ", "Space", { target: button }))).toBeNull();
    expect(keyAction(key("s", "KeyS", { target: button }))).toBe("split");
  });
});
