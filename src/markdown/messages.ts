import type { MessageTable } from "../i18n/messages";

const en = {
  "markdown.image": "[Image: {alt}]",
  "markdown.imageUntitled": "Image",
  "markdown.imageLink": "{alt} ({host})",
  "markdown.imageLinkTitle": "Open image on {host}",
} satisfies Record<string, string>;

export type MarkdownKey = keyof typeof en;
export type MarkdownMessages = Record<MarkdownKey, string>;

export const markdownMessages: MessageTable<MarkdownKey> = {
  en,
  "zh-TW": {
    "markdown.image": "[圖片：{alt}]",
    "markdown.imageUntitled": "圖片",
    "markdown.imageLink": "{alt}（{host}）",
    "markdown.imageLinkTitle": "在 {host} 開啟圖片",
  },
};
