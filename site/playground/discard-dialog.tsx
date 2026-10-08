import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { PlaygroundStrings } from "./strings";

export function DiscardDialog({
  open,
  name,
  strings,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  name: string;
  strings: PlaygroundStrings;
  onKeep: () => void;
  onDiscard: () => void;
}): React.JSX.Element {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeep();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="pg-dialog-backdrop" />
        <AlertDialog.Popup className="pg-dialog">
          <AlertDialog.Title className="pg-dialog-title">{strings.discardTitle}</AlertDialog.Title>
          <AlertDialog.Description className="pg-dialog-body">
            {strings.discardBody(name)}
          </AlertDialog.Description>
          <div className="pg-dialog-actions">
            <AlertDialog.Close className="pg-button">{strings.keep}</AlertDialog.Close>
            <button type="button" className="pg-button pg-button-danger" onClick={onDiscard}>
              {strings.discard}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
