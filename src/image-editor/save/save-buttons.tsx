// The top bar's save as, export and save buttons.
import { useSyncExternalStore } from "react";
import { Button } from "../../primitives/button";
import { Spinner } from "../../primitives/spinner";
import type { EditorApi } from "../api";
import { useLabel } from "../ui/use-label";
import { openExportDialog } from "./export-dialog";
import type { Saver } from "./save";

export function SaveButtons(props: { api: EditorApi; saver: Saver }): React.JSX.Element {
  const { api, saver } = props;
  const label = useLabel();
  const { saving } = useSyncExternalStore(saver.subscribe, saver.state);
  return (
    <>
      <Button variant="ghost" onClick={() => void saver.saveAs()}>
        {label("image.topbar.saveAs")}
      </Button>
      <Button variant="ghost" onClick={() => openExportDialog(api, saver)}>
        {label("image.topbar.export")}
      </Button>
      <Button variant="primary" aria-busy={saving} onClick={() => void saver.save()}>
        {saving ? <Spinner label={label("image.topbar.saving")} /> : label("image.topbar.save")}
      </Button>
    </>
  );
}
