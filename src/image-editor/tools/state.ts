import { useSyncExternalStore } from "react";
import { isAbortError } from "../../contract/errors";
import type { EditorApi, LayerId } from "../api";
import type { SelectPaintKey } from "./messages";

/** Straight-alpha color, each channel 0–255. */
export type RGBA = [number, number, number, number];

export type ToolState = {
  fg: RGBA;
  bg: RGBA;
  brush: { size: number; hardness: number; opacity: number; smoothing: number };
  job: { label: SelectPaintKey; abort(): void } | null;
  rasterizeAsk: { layer: LayerId; resolve(ok: boolean): void } | null;
};

type Entry = { state: ToolState; listeners: Set<() => void> };

const entries = new WeakMap<EditorApi, Entry>();

function entry(api: EditorApi): Entry {
  let e = entries.get(api);
  if (!e) {
    e = {
      state: {
        fg: [0, 0, 0, 255],
        bg: [255, 255, 255, 255],
        brush: { size: 30, hardness: 1, opacity: 1, smoothing: 0 },
        job: null,
        rasterizeAsk: null,
      },
      listeners: new Set(),
    };
    entries.set(api, e);
  }
  return e;
}

export function toolState(api: EditorApi): ToolState {
  return entry(api).state;
}

export function setToolState(api: EditorApi, patch: Partial<ToolState>): void {
  const e = entry(api);
  e.state = { ...e.state, ...patch };
  for (const listener of e.listeners) listener();
}

export function useToolState(api: EditorApi): ToolState {
  const e = entry(api);
  return useSyncExternalStore(
    (onChange) => {
      e.listeners.add(onChange);
      return () => e.listeners.delete(onChange);
    },
    () => e.state,
  );
}

/** Runs `fn` as the editor's one visible job; an abort resolves to null, other errors throw. */
export async function runJob<T>(
  api: EditorApi,
  label: SelectPaintKey,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> {
  const controller = new AbortController();
  const job = { label, abort: () => controller.abort() };
  setToolState(api, { job });
  try {
    return await fn(controller.signal);
  } catch (e) {
    if (isAbortError(e) || controller.signal.aborted) return null;
    throw e;
  } finally {
    if (toolState(api).job === job) setToolState(api, { job: null });
  }
}
