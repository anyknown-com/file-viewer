import { Fragment, useCallback, useSyncExternalStore, type ReactNode } from "react";
import type { ViewerError } from "../contract/errors";
import type { Locale, Vars } from "../i18n/messages";
import { useRoot } from "../primitives/root-context";
import type { MessageKey } from "./api";
import { labelOf } from "./labels";

type Attached = {
  report(e: ViewerError): void;
  locale: Locale;
  overrides: Partial<Record<string, string>>;
};
type Dialog = { id: number; node: ReactNode };
type Notice = { key: MessageKey; vars?: Vars };

// Backs EditorApi.openDialog / showError / t.
export type UiSlot = {
  open(render: (close: () => void) => ReactNode): () => void; // render runs once, on open
  error(e: ViewerError, key?: MessageKey, vars?: Vars): void; // queued until attach
  note(key: MessageKey, vars?: Vars): void; // a notice that reports nothing (save and export)
  dismiss(): void;
  attach(root: Attached | null): void;
  t(key: MessageKey, vars?: Vars): string;
  dialogs(): readonly Dialog[];
  notice(): Notice | null;
  subscribe(fn: () => void): () => void;
};

export function createUiSlot(): UiSlot {
  let root: Attached | null = null;
  let list: readonly Dialog[] = [];
  let current: Notice | null = null;
  let nextId = 1;
  const queue: ViewerError[] = [];
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of listeners) fn();
  };

  return {
    open(render) {
      const id = nextId++;
      const close = () => {
        if (!list.some((d) => d.id === id)) return;
        list = list.filter((d) => d.id !== id);
        notify();
      };
      list = [...list, { id, node: render(close) }];
      notify();
      return close;
    },
    error(e, key, vars) {
      current = { key: key ?? (`error.${e.code}` as MessageKey), vars };
      if (root) root.report(e);
      else queue.push(e);
      notify();
    },
    note(key, vars) {
      current = { key, vars };
      notify();
    },
    dismiss() {
      if (!current) return;
      current = null;
      notify();
    },
    attach(next) {
      root = next;
      if (!root) return;
      for (const e of queue.splice(0)) root.report(e);
    },
    t(key, vars) {
      return labelOf(root?.locale ?? "en", root?.overrides ?? {}, key, vars);
    },
    dialogs: () => list,
    notice: () => current,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// Renders the slot's dialogs inside ViewerRoot and attaches the root's locale, messages
// and onError to the slot. The notice bar lives elsewhere (it reads slot.notice()).
export function UiOutlet(props: { slot: UiSlot }): React.JSX.Element {
  const { slot } = props;
  const { report, locale, overrides } = useRoot();
  const dialogs = useSyncExternalStore(slot.subscribe, slot.dialogs);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      slot.attach({ report, locale, overrides });
      return () => slot.attach(null);
    },
    [slot, report, locale, overrides],
  );
  return (
    <div className="fv-ie-ui" ref={ref}>
      {dialogs.map((d) => (
        <Fragment key={d.id}>{d.node}</Fragment>
      ))}
    </div>
  );
}
