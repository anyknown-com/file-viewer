import type { Locale } from "@anyknown/file-viewer";

export type PlaygroundStrings = {
  drop: string;
  dropHint: string;
  choose: string;
  samples: string;
  close: string;
  local: string;
  discardTitle: string;
  discardBody: (name: string) => string;
  keep: string;
  discard: string;
};

export const STRINGS: Record<Locale, PlaygroundStrings> = {
  en: {
    drop: "Drop a file to open it",
    dropHint: "It stays in this tab. Nothing is uploaded.",
    choose: "Choose a file",
    samples: "Try a sample",
    close: "Close",
    local: "Opened in this tab, nothing uploaded",
    discardTitle: "Discard your changes?",
    discardBody: (name) => `Your changes to “${name}” are not saved.`,
    keep: "Keep editing",
    discard: "Discard",
  },
  "zh-TW": {
    drop: "把檔案拖進來打開",
    dropHint: "檔案只在這個分頁裡，不會上傳。",
    choose: "選一個檔案",
    samples: "試試範例",
    close: "關閉",
    local: "在這個分頁打開，沒有上傳",
    discardTitle: "放棄修改？",
    discardBody: (name) => `「${name}」的修改還沒存。`,
    keep: "繼續編輯",
    discard: "放棄",
  },
};

const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatSize(bytes: number, locale: Locale): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 });
  return `${number.format(value)} ${UNITS[unit]}`;
}
