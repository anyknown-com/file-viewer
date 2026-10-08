// Saving a layered document over a plain image: keep the layers in a project, or flatten.
import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Dialog } from "../../primitives/dialog";
import type { EditorApi } from "../api";
import { useLabel } from "../ui/use-label";

export function SaveChoiceDialog(props: {
  open: boolean;
  onProject(): void;
  onFlatten(): void;
  onCancel(): void;
}): React.JSX.Element {
  const label = useLabel();
  const common = useT(commonMessages);
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
      title={label("image.save.title")}
      footer={
        <>
          {/* First in the popup, so the dialog focuses it when it opens. */}
          <Button variant="primary" onClick={props.onProject}>
            {label("image.save.asProject")}
          </Button>
          <Button onClick={props.onFlatten}>{label("image.save.flatten")}</Button>
          <Button variant="ghost" onClick={props.onCancel}>
            {common("common.cancel")}
          </Button>
        </>
      }
    >
      <p className="fv-ie-save-hint">{label("image.save.asProjectHint")}</p>
      <p className="fv-ie-save-hint">{label("image.save.flattenHint")}</p>
    </Dialog>
  );
}

/** Opens SaveChoiceDialog in the editor; resolves with the choice, or null when cancelled. */
export function askSaveChoice(api: EditorApi): Promise<"project" | "flatten" | null> {
  return new Promise((resolve) => {
    api.openDialog((close) => {
      const pick = (choice: "project" | "flatten" | null) => () => {
        close();
        resolve(choice);
      };
      return (
        <SaveChoiceDialog
          open
          onProject={pick("project")}
          onFlatten={pick("flatten")}
          onCancel={pick(null)}
        />
      );
    });
  });
}
