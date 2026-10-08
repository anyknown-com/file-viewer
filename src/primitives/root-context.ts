import { createContext, useContext } from "react";
import type { Limits } from "../contract/limits";
import type { ViewerError } from "../contract/errors";
import type { Theme } from "../contract/props";
import type { Locale, Messages } from "../i18n/messages";

export type RootContextValue = {
  locale: Locale;
  overrides: Partial<Messages>;
  limits: Limits;
  theme: Theme | undefined;
  portal: HTMLElement | null;
  report: (e: ViewerError) => void;
};

export const RootContext = createContext<RootContextValue | null>(null);

export function useRoot(): RootContextValue {
  const value = useContext(RootContext);
  if (!value) throw new Error("@anyknown/file-viewer: rendered outside ViewerRoot");
  return value;
}
