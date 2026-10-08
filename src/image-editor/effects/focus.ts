import { useSyncExternalStore } from "react";
import type { LayerId } from "../api";

let focused: LayerId | null = null;
const listeners = new Set<() => void>();

export function focusEffects(id: LayerId | null): void {
  if (focused === id) return;
  focused = id;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useEffectsFocus(): LayerId | null {
  return useSyncExternalStore(
    subscribe,
    () => focused,
    () => null,
  );
}
