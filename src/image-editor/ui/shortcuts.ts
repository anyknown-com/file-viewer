// Key dispatch, in Photoshop's order (the plan's 快捷鍵衝突): a focused text field keeps its keys;
// then the current tool; then Delete / Backspace on a selection; then menu shortcuts (so
// layer.delete only runs with no selection); then tool keys.
import type { EditorApi, MenuId } from "../api";
import { menuItems, selectionProvider, tools } from "../registry";
import { matchShortcut } from "../shortcut";

const MENUS: readonly MenuId[] = [
  "edit",
  "image",
  "layer",
  "select",
  "layer-context",
  "layer-new",
  "hidden",
];

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest("input, textarea, [contenteditable]:not([contenteditable='false'])") !== null
  );
}

function toolKey(e: KeyboardEvent, api: EditorApi): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const key = e.key.toUpperCase();
  const matches = tools().filter((t) => t.key.toUpperCase() === key);
  if (matches.length === 0) return false;
  const at = matches.findIndex((t) => t.id === api.session().tool);
  const next = at < 0 ? 0 : e.shiftKey ? (at + 1) % matches.length : at;
  if (matches[next].id !== api.session().tool) api.setSession({ tool: matches[next].id });
  return true;
}

/** Delete / Backspace with no modifier while there is a selection: the provider clears it. */
function clearSelection(e: KeyboardEvent, api: EditorApi): boolean {
  if (e.key !== "Delete" && e.key !== "Backspace") return false;
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  const clear = selectionProvider()?.clear;
  if (!clear || api.selection() === null) return false;
  clear(api);
  return true;
}

/** Every menu's shortcuts, "hidden" included; a disabled item still takes its key. */
function menuShortcut(e: KeyboardEvent, api: EditorApi): boolean {
  const item = MENUS.flatMap((menu) => menuItems(menu)).find(
    (spec) => spec.shortcut !== undefined && matchShortcut(spec.shortcut, e),
  );
  if (!item) return false;
  if (!item.enabled || item.enabled(api)) item.run(api);
  return true;
}

/** Handles `e` for the editor; true when something took it (the caller then prevents the default). */
export function handleKey(e: KeyboardEvent, api: EditorApi): boolean {
  if (typing(e.target)) return false;
  const tool = tools().find((t) => t.id === api.session().tool);
  if (tool?.onKeyDown?.(e, api) === true) return true;
  return clearSelection(e, api) || menuShortcut(e, api) || toolKey(e, api);
}
