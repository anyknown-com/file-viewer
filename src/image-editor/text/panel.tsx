// The text tool's panel: the editing overlay and the missing-font question (controls in step 5).
import { useSyncExternalStore } from "react";
import { useT } from "../../i18n/use-t";
import { ConfirmDialog } from "../../primitives/dialog";
import type { EditorApi } from "../api";
import { setRenderHidden, textEditing } from "./edit-state";
import { TextEditOverlay } from "./editor";
import { replaceMissingFonts } from "./fonts";
import { textShapeMessages } from "./messages";

/** Switches the missing fonts to Geist and starts editing with the layer hidden. */
function confirmMissing(api: EditorApi): void {
  const ed = textEditing.get();
  if (!ed?.missing) return;
  if (ed.layerId !== null) setRenderHidden(api, ed.layerId, true);
  textEditing.set({ ...ed, style: replaceMissingFonts(ed.style), missing: null });
}

export function TextPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(textShapeMessages);
  const ed = useSyncExternalStore(textEditing.subscribe, textEditing.get);
  const missing = ed?.missing ?? null;
  return (
    <>
      <TextEditOverlay api={api} />
      <ConfirmDialog
        open={missing !== null}
        onOpenChange={(open) => {
          if (!open && textEditing.get()?.missing) textEditing.set(null);
        }}
        title={t("image.text.missingFont.title")}
        description={t("image.text.missingFont.body", { font: (missing ?? []).join(", ") })}
        confirmLabel={t("image.text.missingFont.confirm")}
        cancelLabel={t("image.text.missingFont.cancel")}
        onConfirm={() => confirmMissing(api)}
      />
    </>
  );
}
