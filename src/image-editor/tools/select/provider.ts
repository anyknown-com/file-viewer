import type { SelectionProvider } from "../../api";
import { selectionMove } from "./floating";
import { currentSelection } from "./mask";

export const selectionProvider: SelectionProvider = { get: currentSelection, move: selectionMove };
