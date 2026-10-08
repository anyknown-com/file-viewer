import { useSyncExternalStore } from "react";
import type { Theme } from "../contract/props";
import { useRoot } from "../primitives/root-context";

const QUERY = "(prefers-color-scheme: dark)";

// jsdom and some embedded webviews have no matchMedia; treat them as light.
function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function systemTheme(): Theme {
  if (typeof matchMedia !== "function") return "light";
  return matchMedia(QUERY).matches ? "dark" : "light";
}

function serverTheme(): Theme {
  return "light";
}

// The host's theme wins; without one, follow the system setting.
export function useResolvedTheme(): Theme {
  const given = useRoot().theme;
  const system = useSyncExternalStore(subscribe, systemTheme, serverTheme);
  return given ?? system;
}
