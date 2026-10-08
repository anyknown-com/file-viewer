import type { MessageTable } from "../../i18n/messages";
import { en } from "./messages-en";
import { zhTW } from "./messages-zh-tw";

export type SelectPaintKey = keyof typeof en;
export type SelectPaintMessages = Record<SelectPaintKey, string>;

export const selectPaintMessages: MessageTable<SelectPaintKey> = { en, "zh-TW": zhTW };
