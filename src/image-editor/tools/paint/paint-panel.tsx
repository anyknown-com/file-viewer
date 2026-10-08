import { commonMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/use-t";
import { ConfirmDialog } from "../../../primitives/dialog";
import { NumberField } from "../../../primitives/number-field";
import type { EditorApi } from "../../api";
import { selectPaintMessages } from "../messages";
import { setToolState, toolState, useToolState, type ToolState } from "../state";
import { ColorSwatches } from "./color-swatches";

/** The brush and eraser options, and the rasterize question `ensurePaintable` asks. */
export function PaintPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const { brush } = useToolState(api);
  const set = (patch: Partial<ToolState["brush"]>): void =>
    setToolState(api, { brush: { ...toolState(api).brush, ...patch } });
  return (
    <>
      <ColorSwatches api={api} />
      <NumberField
        label={t("image.paint.size")}
        value={brush.size}
        min={1}
        max={2100}
        onChange={(size) => set({ size })}
      />
      <NumberField
        label={t("image.paint.hardness")}
        value={Math.round(brush.hardness * 100)}
        min={0}
        max={100}
        onChange={(v) => set({ hardness: v / 100 })}
      />
      <NumberField
        label={t("image.paint.opacity")}
        value={Math.round(brush.opacity * 100)}
        min={1}
        max={100}
        onChange={(v) => set({ opacity: v / 100 })}
      />
      <NumberField
        label={t("image.paint.smoothing")}
        value={Math.round(brush.smoothing * 100)}
        min={0}
        max={100}
        onChange={(v) => set({ smoothing: v / 100 })}
      />
      <RasterizeAsk api={api} />
    </>
  );
}

/** The rasterize question `ensurePaintable` asks; every tool that calls it renders this. */
export function RasterizeAsk({ api }: { api: EditorApi }): React.JSX.Element | null {
  const t = useT(selectPaintMessages);
  const common = useT(commonMessages);
  const { rasterizeAsk } = useToolState(api);
  if (!rasterizeAsk) return null;
  const answer = (ok: boolean): void => {
    setToolState(api, { rasterizeAsk: null });
    rasterizeAsk.resolve(ok);
  };
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
      title={t("image.paint.rasterizeTitle")}
      description={t("image.paint.rasterizeBody")}
      confirmLabel={t("image.paint.rasterize")}
      cancelLabel={common("common.cancel")}
      onConfirm={() => answer(true)}
    />
  );
}
