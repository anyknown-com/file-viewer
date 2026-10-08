import type { AudioMessages } from "../audio-editor/messages";
import type { ExcalidrawMessages } from "../excalidraw/messages";
import type { ImageMessages } from "../image-editor/messages";
import type { MarkdownMessages } from "../markdown/messages";
import type { VideoMessages } from "../video-editor/messages";
import type { ViewerMessages } from "../viewer/messages";
import { en, type CommonKey, type CommonMessages } from "./en";
import { zhTW } from "./zh-tw";

/** A language the built-in text is available in. */
export type Locale = "en" | "zh-TW";
export type Vars = Record<string, string | number>;
/** A table of strings per Locale for one area's keys. */
export type MessageTable<K extends string> = Record<Locale, Record<K, string>>;
// Each area adds "& <Area>Messages" here with import type (02-contract).
/** Every built-in string key with its text; pass a Partial of it as messages to override. */
export type Messages = CommonMessages &
  ViewerMessages &
  ImageMessages &
  MarkdownMessages &
  ExcalidrawMessages &
  AudioMessages &
  VideoMessages;

export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function translate<K extends string>(
  table: MessageTable<K>,
  locale: Locale,
  overrides: Partial<Messages>,
  key: K,
  vars?: Vars,
): string {
  const s = (overrides as Partial<Record<string, string>>)[key] ?? table[locale][key];
  return format(s, vars);
}

export const commonMessages: MessageTable<CommonKey> = { en, "zh-TW": zhTW };
