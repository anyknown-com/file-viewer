import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { Button } from "./button";
import { useRoot } from "./root-context";

export function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}): React.JSX.Element {
  const { portal } = useRoot();
  return (
    <BaseDialog.Root open={props.open} onOpenChange={(o) => props.onOpenChange(o)}>
      <BaseDialog.Portal container={portal}>
        <BaseDialog.Backdrop className="fv-dialog-backdrop" />
        <BaseDialog.Popup className="fv-dialog">
          <BaseDialog.Title className="fv-dialog-title">{props.title}</BaseDialog.Title>
          {props.description && (
            <BaseDialog.Description className="fv-dialog-description">
              {props.description}
            </BaseDialog.Description>
          )}
          {props.children}
          {props.footer && <div className="fv-dialog-footer">{props.footer}</div>}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}): React.JSX.Element {
  const { portal } = useRoot();
  return (
    <AlertDialog.Root open={props.open} onOpenChange={(o) => props.onOpenChange(o)}>
      <AlertDialog.Portal container={portal}>
        <AlertDialog.Backdrop className="fv-dialog-backdrop" />
        <AlertDialog.Popup className="fv-dialog">
          <AlertDialog.Title className="fv-dialog-title">{props.title}</AlertDialog.Title>
          <AlertDialog.Description className="fv-dialog-description">
            {props.description}
          </AlertDialog.Description>
          <div className="fv-dialog-footer">
            <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
              {props.cancelLabel}
            </Button>
            <Button
              variant={props.danger ? "danger" : "primary"}
              onClick={() => {
                props.onConfirm();
                props.onOpenChange(false);
              }}
            >
              {props.confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function DiscardDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}): React.JSX.Element {
  const t = useT(commonMessages);
  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("discard.title")}
      description={t("discard.body")}
      confirmLabel={t("discard.confirm")}
      cancelLabel={t("discard.keep")}
      danger
      onConfirm={props.onDiscard}
    />
  );
}
