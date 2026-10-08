import { useRef, useState, useSyncExternalStore } from "react";
import { Tooltip } from "../../primitives/tooltip";
import { cx } from "../../primitives/cx";
import type { EditorApi, ToolSpec } from "../api";
import { internalsOf } from "../editor-api";
import { tools } from "../registry";
import { useLabel } from "./use-label";

const HOLD_MS = 400;

/** Tools in registration order; tools sharing a `slot` share one cell. */
function cells(list: readonly ToolSpec[]): ToolSpec[][] {
  const out: ToolSpec[][] = [];
  const bySlot = new Map<string, ToolSpec[]>();
  for (const tool of list) {
    const cell = tool.slot === undefined ? undefined : bySlot.get(tool.slot);
    if (cell) cell.push(tool);
    else {
      const fresh = [tool];
      out.push(fresh);
      if (tool.slot !== undefined) bySlot.set(tool.slot, fresh);
    }
  }
  return out;
}

function ToolButton(props: {
  tool: ToolSpec;
  pressed: boolean;
  onPick(): void;
  onExpand?(): void;
}): React.JSX.Element {
  const label = useLabel();
  const hold = useRef(0);
  // A hold that opened the flyout ends in a click; that click is not a pick.
  const held = useRef(false);
  const { tool, onExpand } = props;
  const Glyph = tool.icon;
  const stop = () => {
    window.clearTimeout(hold.current);
    hold.current = 0;
  };
  return (
    <Tooltip content={label(tool.label)}>
      <button
        type="button"
        className={cx("fv-ie-tool", props.pressed && "fv-ie-tool-on")}
        aria-label={label(tool.label)}
        aria-pressed={props.pressed}
        onClick={() => {
          if (held.current) held.current = false;
          else props.onPick();
        }}
        onPointerDown={() => {
          if (!onExpand) return;
          held.current = false;
          hold.current = window.setTimeout(() => {
            held.current = true;
            onExpand();
          }, HOLD_MS);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onContextMenu={(e) => {
          if (!onExpand) return;
          e.preventDefault();
          onExpand();
        }}
      >
        <Glyph />
        {onExpand && <span className="fv-ie-tool-more" aria-hidden />}
      </button>
    </Tooltip>
  );
}

/** The left tool column. A slot shows its current tool; hold or right-click it for the others. */
export function Toolbar({ api }: { api: EditorApi }): React.JSX.Element {
  const session = useSyncExternalStore(internalsOf(api).subscribeSession, api.session);
  const [open, setOpen] = useState<string | null>(null);
  const pick = (tool: ToolSpec) => {
    setOpen(null);
    api.setSession({ tool: tool.id });
  };
  return (
    <div className="fv-ie-toolbar" role="toolbar" aria-orientation="vertical">
      {cells(tools()).map((cell) => {
        const shown = cell.find((t) => t.id === session.tool) ?? cell[0];
        const id = cell[0].id;
        return (
          <div className="fv-ie-tool-cell" key={id}>
            <ToolButton
              tool={shown}
              pressed={shown.id === session.tool}
              onPick={() => pick(shown)}
              onExpand={cell.length > 1 ? () => setOpen(open === id ? null : id) : undefined}
            />
            {open === id && (
              <div className="fv-ie-tool-flyout">
                {cell.map((tool) => (
                  <ToolButton
                    key={tool.id}
                    tool={tool}
                    pressed={tool.id === session.tool}
                    onPick={() => pick(tool)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
