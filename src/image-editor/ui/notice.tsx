import type { Vars } from "../../i18n/messages";
import type { MessageKey } from "../api";
import { useLabel } from "./use-label";

/** The editor's own notices under the top bar (toasts belong to the host). */
export function Notice(props: { messages: { key: MessageKey; vars?: Vars }[] }): React.JSX.Element {
  const label = useLabel();
  // Always mounted, so screen readers hear a notice that appears; empty, it takes no space.
  return (
    <output className="fv-ie-notice">
      {props.messages.map((m) => (
        <span key={m.key}>{label(m.key, m.vars)}</span>
      ))}
    </output>
  );
}
