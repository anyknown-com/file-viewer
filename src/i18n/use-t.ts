import { useCallback } from "react";
import { useRoot } from "../primitives/root-context";
import { translate, type MessageTable, type Vars } from "./messages";

export function useT<K extends string>(table: MessageTable<K>) {
  const root = useRoot();
  return useCallback(
    (key: K, vars?: Vars) => translate(table, root.locale, root.overrides, key, vars),
    [table, root.locale, root.overrides],
  );
}
