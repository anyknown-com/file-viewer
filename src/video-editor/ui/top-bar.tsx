import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { CloseIcon } from "../../primitives/glyphs";
import { Icon } from "../../primitives/icon";
import { Tooltip } from "../../primitives/tooltip";
import { videoMessages } from "../messages";

function UndoIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Icon>
  );
}

function RedoIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </Icon>
  );
}

export function TopBar(props: {
  name: string;
  canUndo: boolean;
  canRedo: boolean;
  onClose(): void;
  onUndo(): void;
  onRedo(): void;
  onSplit(): void;
  onAddText(): void;
  onExport(): void;
}): React.JSX.Element {
  const t = useT(videoMessages);
  const tc = useT(commonMessages);
  return (
    <div className="fv-ve-top">
      <Tooltip content={tc("common.close")}>
        <Button
          variant="ghost"
          aria-label={tc("common.close")}
          icon={<CloseIcon />}
          onClick={props.onClose}
        />
      </Tooltip>
      <span className="fv-ve-name">{props.name}</span>
      <Tooltip content={t("video.undo")}>
        <Button
          variant="ghost"
          aria-label={t("video.undo")}
          icon={<UndoIcon />}
          disabled={!props.canUndo}
          onClick={props.onUndo}
        />
      </Tooltip>
      <Tooltip content={t("video.redo")}>
        <Button
          variant="ghost"
          aria-label={t("video.redo")}
          icon={<RedoIcon />}
          disabled={!props.canRedo}
          onClick={props.onRedo}
        />
      </Tooltip>
      <Button variant="ghost" onClick={props.onSplit}>
        {t("video.split")}
      </Button>
      <Button variant="ghost" onClick={props.onAddText}>
        {t("video.addText")}
      </Button>
      <Button variant="primary" className="fv-ve-export" onClick={props.onExport}>
        {t("video.export")}
      </Button>
    </div>
  );
}
