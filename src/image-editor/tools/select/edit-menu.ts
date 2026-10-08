import type { EditorApi, MenuItemSpec } from "../../api";
import { registerMenuItem, registerSetup } from "../../registry";
import { attachPaste, clearSelection, copy, cut, internalClip, pasteInternal } from "./clipboard";
import { openFillDialog } from "./fill-dialog";
import { hasSelection } from "./mask";

const hasActive = (api: EditorApi): boolean => api.session().active !== null;

const item = (
  id: string,
  label: MenuItemSpec["label"],
  run: (api: EditorApi) => void,
  extra: Partial<MenuItemSpec> = {},
): void => registerMenuItem({ id, menu: "edit", label, run, ...extra });

export function registerEditMenu(): void {
  item("edit.cut", "image.select.cut", cut, { shortcut: "Mod+X", enabled: hasActive });
  item("edit.copy", "image.select.copy", (api) => void copy(api, false), {
    shortcut: "Mod+C",
    enabled: hasActive,
  });
  item("edit.copyMerged", "image.select.copyMerged", (api) => void copy(api, true), {
    shortcut: "Mod+Shift+C",
  });
  item("edit.paste", "image.select.paste", pasteInternal, {
    enabled: (api) => internalClip(api) !== null,
  });
  item("edit.fill", "image.select.fill", openFillDialog, {
    shortcut: "Shift+F5",
    enabled: hasActive,
  });
  item("edit.clear", "image.select.clear", (api) => void clearSelection(api), {
    enabled: hasSelection,
  });
  registerSetup(attachPaste);
}
