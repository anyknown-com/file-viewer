import type { ReactNode } from "react";
import { Button } from "../../primitives/button";
import { CloseIcon } from "../../primitives/glyphs";
import { Tooltip } from "../../primitives/tooltip";
import { RedoIcon, UndoIcon } from "../glyphs";
import { useLabel } from "./use-label";

export function Topbar(props: {
  name: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The WebGL context is lost: undo, redo and saving wait. */
  blocked: boolean;
  onUndo(): void;
  onRedo(): void;
  onClose(): void;
  saveSlot: ReactNode;
}): React.JSX.Element {
  const label = useLabel();
  const iconButton = (key: "image.topbar.close" | "image.topbar.undo" | "image.topbar.redo") => ({
    "aria-label": label(key),
    variant: "ghost" as const,
  });
  return (
    <div className="fv-ie-topbar">
      <Tooltip content={label("image.topbar.close")}>
        <Button
          {...iconButton("image.topbar.close")}
          icon={<CloseIcon />}
          onClick={props.onClose}
        />
      </Tooltip>
      <span className="fv-ie-name">
        {props.name}
        {props.dirty && (
          <span className="fv-ie-dirty" title={label("image.topbar.unsaved")}>
            {" •"}
            <span className="fv-ie-sr">{label("image.topbar.unsaved")}</span>
          </span>
        )}
      </span>
      <Tooltip content={label("image.topbar.undo")}>
        <Button
          {...iconButton("image.topbar.undo")}
          icon={<UndoIcon />}
          disabled={props.blocked || !props.canUndo}
          onClick={props.onUndo}
        />
      </Tooltip>
      <Tooltip content={label("image.topbar.redo")}>
        <Button
          {...iconButton("image.topbar.redo")}
          icon={<RedoIcon />}
          disabled={props.blocked || !props.canRedo}
          onClick={props.onRedo}
        />
      </Tooltip>
      <div className="fv-ie-save" inert={props.blocked}>
        {props.saveSlot}
      </div>
    </div>
  );
}
