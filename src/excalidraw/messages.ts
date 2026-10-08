import type { MessageTable } from "../i18n/messages";

const en = {
  "excalidraw.loading": "Loading diagram…",
  "excalidraw.broken": "This diagram can't be read",
  "excalidraw.edit": "Edit diagram",
} satisfies Record<string, string>;

export type ExcalidrawKey = keyof typeof en;
export type ExcalidrawMessages = Record<ExcalidrawKey, string>;

export const excalidrawMessages: MessageTable<ExcalidrawKey> = {
  en,
  "zh-TW": {
    "excalidraw.loading": "載入圖…",
    "excalidraw.broken": "這張圖讀不出來",
    "excalidraw.edit": "編輯這張圖",
  },
};
