import type { SelectionProvider } from "../../api";
import { currentSelection } from "./mask";

export const selectionProvider: SelectionProvider = { get: currentSelection };
