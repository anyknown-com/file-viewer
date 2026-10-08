import type { ReactNode } from "react";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { Tooltip } from "../primitives/tooltip";
import { type AudioEdit, cut, fade, keep, type Range, split } from "./edit";
import {
  DeleteIcon,
  FadeInIcon,
  FadeOutIcon,
  KeepIcon,
  RedoIcon,
  SplitIcon,
  UndoIcon,
} from "./glyphs";
import { audioMessages } from "./messages";

export type ToolsProps = {
  selection: Range | null;
  playhead: number;
  onApply: (next: AudioEdit) => void;
  state: AudioEdit;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  children?: ReactNode;
};

function Tool(props: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <Tooltip content={props.label}>
      <Button
        variant="ghost"
        className={props.className}
        aria-label={props.label}
        icon={props.icon}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        <span className="fv-audio-tool-label">{props.label}</span>
      </Button>
    </Tooltip>
  );
}

export function Tools(props: ToolsProps): React.JSX.Element {
  const t = useT(audioMessages);
  const { selection, state, onApply } = props;
  const withSelection = (op: (sel: Range) => AudioEdit) => () => {
    if (selection) onApply(op(selection));
  };
  return (
    <div className="fv-audio-tools">
      <Tool
        label={t("audio.delete")}
        icon={<DeleteIcon />}
        disabled={!selection}
        onClick={withSelection((sel) => cut(state, sel))}
      />
      <Tool
        label={t("audio.keepSelection")}
        icon={<KeepIcon />}
        disabled={!selection}
        onClick={withSelection((sel) => keep(state, sel))}
      />
      <Tool
        label={t("audio.split")}
        icon={<SplitIcon />}
        onClick={() => onApply(split(state, props.playhead))}
      />
      <Tool
        label={t("audio.fadeIn")}
        icon={<FadeInIcon />}
        disabled={!selection}
        onClick={withSelection((sel) => fade(state, sel, "in"))}
      />
      <Tool
        label={t("audio.fadeOut")}
        icon={<FadeOutIcon />}
        disabled={!selection}
        onClick={withSelection((sel) => fade(state, sel, "out"))}
      />
      {props.children}
      <Tool
        className="fv-audio-tool-history"
        label={t("audio.undo")}
        icon={<UndoIcon />}
        disabled={!props.canUndo}
        onClick={props.onUndo}
      />
      <Tool
        className="fv-audio-tool-history"
        label={t("audio.redo")}
        icon={<RedoIcon />}
        disabled={!props.canRedo}
        onClick={props.onRedo}
      />
    </div>
  );
}
