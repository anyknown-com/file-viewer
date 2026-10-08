import { useCallback } from "react";
import type { Vars } from "../../i18n/messages";
import { useRoot } from "../../primitives/root-context";
import type { MessageKey } from "../api";
import { labelOf } from "../labels";

/** Translates any area's key with the merged table (see labels.ts), the root's locale and messages. */
export function useLabel(): (key: MessageKey, vars?: Vars) => string {
  const { locale, overrides } = useRoot();
  return useCallback(
    (key: MessageKey, vars?: Vars) => labelOf(locale, overrides, key, vars),
    [locale, overrides],
  );
}
