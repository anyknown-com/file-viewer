import type { MessageTable } from "../i18n/messages";

export type ViewerKey = "viewer.loading" | "viewer.downloadHint" | "viewer.back";
export type ViewerMessages = Record<ViewerKey, string>;

export const viewerMessages: MessageTable<ViewerKey> = {
  en: {
    "viewer.loading": "Loading…",
    "viewer.downloadHint": "Download it and open it with an app on your device.",
    "viewer.back": "Back",
  },
  "zh-TW": {
    "viewer.loading": "載入中…",
    "viewer.downloadHint": "下載後用裝置上的 app 打開。",
    "viewer.back": "返回",
  },
};
