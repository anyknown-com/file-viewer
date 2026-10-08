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

function isMac(): boolean {
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
