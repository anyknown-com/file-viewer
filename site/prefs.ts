// Visitor preferences (theme, component language) and the hash route, as tiny external stores
// read with useSyncExternalStore — no effects. Each preference is remembered in localStorage when
// it can be; private mode or blocked storage just means it lasts for this visit.
import type { Locale } from "@anyknown/file-viewer";
import { useSyncExternalStore } from "react";

type Store<T> = {
  getSnapshot: () => T;
  subscribe: (listener: () => void) => () => void;
  set: (value: T) => void;
};

function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

function load<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const saved = localStorage.getItem(key);
    return allowed.find((v) => v === saved) ?? null;
  } catch {
    return null;
  }
}

function save(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice still holds for this visit */
  }
}

export type ThemeMode = "system" | "light" | "dark";
export const THEME_KEY = "fv-site-theme";
export const LOCALE_KEY = "fv-site-locale";

const themeStore = createStore<ThemeMode>(load(THEME_KEY, ["light", "dark"] as const) ?? "system");
const localeStore = createStore<Locale>(load(LOCALE_KEY, ["en", "zh-TW"] as const) ?? "en");

export function setTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
  save(THEME_KEY, mode === "system" ? null : mode);
  themeStore.set(mode);
}

export function useTheme(): ThemeMode {
  return useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot);
}

export function setLocale(locale: Locale): void {
  save(LOCALE_KEY, locale);
  localeStore.set(locale);
}

export function useSiteLocale(): Locale {
  return useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot);
}

function subscribeHash(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function useHash(): string {
  return useSyncExternalStore(subscribeHash, () => location.hash);
}
