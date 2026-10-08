import type { MessageTable } from "../i18n/messages";
import { en } from "./messages-en";
import { zhTW } from "./messages-zh-tw";

export type ImageKey = keyof typeof en;
export type ImageMessages = Record<ImageKey, string>;

export const imageMessages: MessageTable<ImageKey> = { en, "zh-TW": zhTW };
