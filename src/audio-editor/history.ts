import { type AudioEdit } from "./edit";

export type History = {
  past: AudioEdit[];
  present: AudioEdit;
  future: AudioEdit[];
  initial: AudioEdit;
};
export type HistoryAction =
  | { type: "apply"; next: AudioEdit }
  | { type: "undo" }
  | { type: "redo" };

export const HISTORY_LIMIT = 200;

export function initialHistory(edit: AudioEdit): History {
  return { past: [], present: edit, future: [], initial: edit };
}

export function historyReducer(h: History, a: HistoryAction): History {
  switch (a.type) {
    case "apply": {
      const past = [...h.past, h.present];
      if (past.length > HISTORY_LIMIT) past.shift();
      return { ...h, past, present: a.next, future: [] };
    }
    case "undo": {
      if (h.past.length === 0) return h;
      return {
        ...h,
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1],
        future: [h.present, ...h.future],
      };
    }
    case "redo": {
      if (h.future.length === 0) return h;
      return {
        ...h,
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      };
    }
  }
}

export function isDirty(h: History): boolean {
  return h.present !== h.initial;
}
