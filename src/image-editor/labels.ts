import {
  commonMessages,
  translate,
  type Locale,
  type MessageTable,
  type Vars,
} from "../i18n/messages";
import type { MessageKey } from "./api";
import { imageMessages } from "./messages";
import { messageTables } from "./registry";

let cache: { from: readonly MessageTable<string>[]; table: MessageTable<string> } | null = null;

function merge(sources: readonly MessageTable<string>[]): MessageTable<string> {
  const out: MessageTable<string> = { en: {}, "zh-TW": {} };
  for (const locale of ["en", "zh-TW"] as const) {
    for (const source of sources) {
      for (const [key, value] of Object.entries(source[locale])) {
        if (!(key in out[locale])) out[locale][key] = value;
      }
    }
  }
  return out;
}

// commonMessages → imageMessages → messageTables() in registration order; the first table
// with a key wins. Rebuilt when the registered tables change.
export function labelTable(): MessageTable<string> {
  const from = messageTables();
  if (cache && cache.from.length === from.length && cache.from.every((t, i) => t === from[i])) {
    return cache.table;
  }
  const table = merge([commonMessages, imageMessages, ...from]);
  cache = { from, table };
  return table;
}

export function labelOf(
  locale: Locale,
  overrides: Partial<Record<string, string>>,
  key: MessageKey,
  vars?: Vars,
): string {
  return translate(labelTable(), locale, overrides, key, vars);
}
