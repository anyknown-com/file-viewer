import type { SelectionProvider } from "../../api";
import { clearSelection } from "./clipboard";
import { selectionMove } from "./floating";
import { currentSelection } from "./mask";

export const selectionProvider: SelectionProvider = {
  get: currentSelection,
  move: selectionMove,
  clear: (api) => {
    clearSelection(api);
  },
};
