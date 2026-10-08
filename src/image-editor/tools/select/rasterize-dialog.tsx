import { commonMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/use-t";
import { ConfirmDialog } from "../../../primitives/dialog";
import type { EditorApi, LayerId, PixelTarget } from "../../api";
import { rasterizeLayer, needsRasterize } from "../commands";
import { selectPaintMessages } from "../messages";

function RasterizeDialog(props: { onConfirm(): void; close(): void }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const common = useT(commonMessages);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) props.close();
      }}
      title={t("image.paint.rasterizeTitle")}
      description={t("image.paint.rasterizeBody")}
      confirmLabel={t("image.paint.rasterize")}
      cancelLabel={common("common.cancel")}
      onConfirm={props.onConfirm}
    />
  );
}

/**
 * Runs `edit` now, or, for a text or shape layer painted on its image, after the user agrees to
 * rasterize it. The rasterize is dispatched without a label so it joins `edit`'s commit.
 */
export function withRasterized(
  api: EditorApi,
  id: LayerId,
  target: PixelTarget,
  edit: () => void,
): void {
  const layer = api.doc().manifest.layers.find((l) => l.id === id);
  if (target !== "image" || !layer || !needsRasterize(layer)) return edit();
  api.openDialog((close) => (
    <RasterizeDialog
      close={close}
      onConfirm={() => {
        api.dispatch(rasterizeLayer(id));
        edit();
      }}
    />
  ));
}
