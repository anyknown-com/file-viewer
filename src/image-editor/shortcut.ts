export type Shortcut = { key: string; mod: boolean; alt: boolean; shift: boolean };

// "Mod+Shift+S" → { key: "S", mod, shift }. The key is the last segment, so "Mod++" is "+".
export function parseShortcut(s: string): Shortcut {
  const parts = s.split("+");
  let key = parts.pop() ?? "";
  if (key === "" && s.endsWith("+")) {
    parts.pop();
    key = "+";
  }
  return {
    key: key.toUpperCase(),
    mod: parts.includes("Mod"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
  };
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && navigator.platform.includes("Mac");
}

// Mod = metaKey on macOS, ctrlKey elsewhere; the other one must be up.
export function matchShortcut(s: string, e: KeyboardEvent): boolean {
  const want = parseShortcut(s);
  const mac = isMac();
  const mod = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  return (
    e.key.toUpperCase() === want.key &&
    mod === want.mod &&
    !other &&
    e.altKey === want.alt &&
    e.shiftKey === want.shift
  );
}

// What a menu shows for `s`: ⌘⇧Z on macOS, Ctrl+Shift+Z elsewhere.
export function shortcutLabel(s: string): string {
  const { key, mod, alt, shift } = parseShortcut(s);
  const name = key.length === 1 ? key : key[0] + key.slice(1).toLowerCase();
  if (isMac()) return `${mod ? "⌘" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${name}`;
  return [mod && "Ctrl", alt && "Alt", shift && "Shift", name].filter(Boolean).join("+");
}
