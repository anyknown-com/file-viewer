import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { ConfirmDialog, DiscardDialog } from "../../primitives/dialog";
import { videoMessages } from "../messages";

/** Asks before closing: "discard changes?" while editing, "stop the export?" while one runs. */
export function CloseGuard(props: {
  open: boolean;
  exporting: boolean;
  onConfirm(): void;
  onCancel(): void;
}): React.JSX.Element {
  const t = useT(videoMessages);
  const tc = useT(commonMessages);
  const onOpenChange = (open: boolean) => {
    if (!open) props.onCancel();
  };
  if (!props.exporting)
    return (
      <DiscardDialog open={props.open} onOpenChange={onOpenChange} onDiscard={props.onConfirm} />
    );
  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={onOpenChange}
      title={t("video.discardExport")}
      description={t("video.discardExportBody")}
      confirmLabel={t("video.discardExportConfirm")}
      cancelLabel={tc("common.cancel")}
      danger
      onConfirm={props.onConfirm}
    />
  );
}
