// The image editor's own menu items and shortcuts (11–13 add theirs through installExtensions).
import type { EditorApi } from "./api";
import { internalsOf } from "./editor-api";
import {
  activeLayer,
  deleteLayer,
  duplicate,
  group,
  isFolder,
  newFolder,
  newLayer,
  redo,
  ungroupFolder,
  undo,
} from "./layer-ops";
import { menuItems, registerMenuItem } from "./registry";

const hasActive = (api: EditorApi): boolean => activeLayer(api) !== undefined;

function onActive(fn: (api: EditorApi, id: string) => void) {
  return (api: EditorApi) => {
    const layer = activeLayer(api);
    if (layer) fn(api, layer.id);
  };
}

/** Idempotent: returns at once when `edit.undo` is already registered. */
export function registerCore(): void {
  if (menuItems("edit").some((item) => item.id === "edit.undo")) return;
  registerMenuItem({
    id: "edit.undo",
    menu: "edit",
    label: "image.topbar.undo",
    shortcut: "Mod+Z",
    enabled: (api) => internalsOf(api).store.canUndo(),
    run: undo,
  });
  registerMenuItem({
    id: "edit.redo",
    menu: "edit",
    label: "image.topbar.redo",
    shortcut: "Mod+Shift+Z",
    enabled: (api) => internalsOf(api).store.canRedo(),
    run: redo,
  });
  registerMenuItem({ id: "layer.new", menu: "layer", label: "image.layers.new", run: newLayer });
  registerMenuItem({
    id: "layer.newFolder",
    menu: "layer",
    label: "image.layers.newFolder",
    run: newFolder,
  });
  registerMenuItem({
    id: "layer.duplicate",
    menu: "layer",
    label: "image.layers.duplicate",
    shortcut: "Mod+J",
    enabled: hasActive,
    run: onActive(duplicate),
  });
  registerMenuItem({
    id: "layer.group",
    menu: "layer",
    label: "image.layers.group",
    shortcut: "Mod+G",
    enabled: hasActive,
    run: onActive(group),
  });
  registerMenuItem({
    id: "layer.ungroup",
    menu: "layer",
    label: "image.layers.ungroup",
    shortcut: "Mod+Shift+G",
    enabled: (api) => {
      const layer = activeLayer(api);
      return layer !== undefined && isFolder(layer);
    },
    run: onActive(ungroupFolder),
  });
  registerMenuItem({
    id: "layer.delete",
    menu: "layer",
    label: "image.layers.delete",
    shortcut: "Backspace",
    enabled: hasActive,
    run: onActive(deleteLayer),
  });
  // Photoshop deletes the layer on either key; the menu shows the first one.
  registerMenuItem({
    id: "layer.delete.forward",
    menu: "hidden",
    label: "image.layers.delete",
    shortcut: "Delete",
    enabled: hasActive,
    run: onActive(deleteLayer),
  });
}
