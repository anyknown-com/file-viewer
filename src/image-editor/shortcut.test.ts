import { afterEach, describe, expect, it, vi } from "vitest";
import { matchShortcut, parseShortcut } from "./shortcut";

afterEach(() => vi.unstubAllGlobals());

function key(k: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: k, ...mods });
}

function onPlatform(platform: string) {
  vi.stubGlobal("navigator", { ...navigator, platform });
}

describe("parseShortcut", () => {
  it("parses modifiers and the key", () => {
    expect(parseShortcut("Mod+Shift+S")).toEqual({ key: "S", mod: true, alt: false, shift: true });
    expect(parseShortcut("Mod+Alt+Shift+S")).toEqual({
      key: "S",
      mod: true,
      alt: true,
      shift: true,
    });
    expect(parseShortcut("v")).toEqual({ key: "V", mod: false, alt: false, shift: false });
  });

  it("parses symbol keys", () => {
    expect(parseShortcut("[")).toEqual({ key: "[", mod: false, alt: false, shift: false });
    expect(parseShortcut("Mod+]")).toEqual({ key: "]", mod: true, alt: false, shift: false });
    expect(parseShortcut("Mod++")).toEqual({ key: "+", mod: true, alt: false, shift: false });
  });
});

describe("matchShortcut", () => {
  it("uses metaKey on macOS", () => {
    onPlatform("MacIntel");
    expect(matchShortcut("Mod+Shift+S", key("S", { metaKey: true, shiftKey: true }))).toBe(true);
    expect(matchShortcut("Mod+Shift+S", key("S", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchShortcut("Mod+S", key("s", { metaKey: true, shiftKey: true }))).toBe(false);
  });

  it("uses ctrlKey elsewhere", () => {
    onPlatform("Win32");
    expect(matchShortcut("Mod+Shift+S", key("S", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matchShortcut("Mod+Shift+S", key("S", { metaKey: true, shiftKey: true }))).toBe(false);
  });

  it("matches symbol keys without modifiers", () => {
    onPlatform("MacIntel");
    expect(matchShortcut("[", key("["))).toBe(true);
    expect(matchShortcut("[", key("[", { metaKey: true }))).toBe(false);
    expect(matchShortcut("V", key("v"))).toBe(true);
  });
});
