import { useState } from "react";
import { toViewerError } from "../../../contract/errors";
import { commonMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import { Dialog } from "../../../primitives/dialog";
import { NumberField } from "../../../primitives/number-field";
import { Progress } from "../../../primitives/progress";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type { Doc, EditorApi, Layer, LayerId, Rect } from "../../api";
import { isPixelLayer } from "../commands";
import { docRectToLayer, layerPixelSize } from "../geom";
import { CONTENT_FILL_MAX_PIXELS } from "../heal/content-fill";
import { selectPaintMessages } from "../messages";
import { runJob, toolState, useToolState } from "../state";
import { createTileTracker } from "../tiles";
import { currentSelection } from "./mask";
import { selectionInLayer } from "./mask-sample";
import { editSelected } from "./pixel-edit";
import { withRasterized } from "./rasterize-dialog";
import { clampRect } from "./resample";

export type fillOptions = {
  contents: "foreground" | "background";
  opacity: number;
};

/** Fills the selection (the whole layer without one) with the foreground or background color. */
export function applyFill(api: EditorApi, opts: fillOptions): boolean {
  const color = toolState(api)[opts.contents === "foreground" ? "fg" : "bg"];
  const k = (color[3] / 255) * (opts.opacity / 100);
  const luma = Math.round(0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]);
  return editSelected(api, "image.select.fill", { wholeIfNone: true }, (px, sel, target) => {
    for (let i = 0; i < sel.length; i++) {
      const s = (sel[i] / 255) * k;
      if (target === "mask") {
        px[i] = Math.round(px[i] + (luma - px[i]) * s);
        continue;
      }
      const o = i * 4;
      const ab = px[o + 3] / 255;
      const ao = s + ab * (1 - s);
      if (ao === 0) continue;
      for (let c = 0; c < 3; c++)
        px[o + c] = Math.round((color[c] * s + px[o + c] * ab * (1 - s)) / ao);
      px[o + 3] = Math.round(ao * 255);
    }
  });
}

/** Selected pixels (at least half selected) in document pixels; 0 without a selection. */
function holePixels(api: EditorApi): number {
  const sel = currentSelection(api);
  if (!sel) return 0;
  let n = 0;
  for (const v of sel.read(sel.bounds)) if (v >= 128) n++;
  return n;
}

/** The active layer when Content-Aware Fill can run on its image: a selection of 1 px to 4 MP. */
function fillableLayer(api: EditorApi): Layer | null {
  const { active, target } = api.session();
  const layer = api.doc().manifest.layers.find((l) => l.id === active);
  if (!layer || !isPixelLayer(layer) || target === "mask") return null;
  const n = holePixels(api);
  return n > 0 && n <= CONTENT_FILL_MAX_PIXELS ? layer : null;
}

/** `filled` over `base` through `sel` × `k`, premultiplied; both straight-alpha RGBA, in place in `base`. */
function blendThrough(base: Uint8Array, filled: Uint8Array, sel: Uint8Array, k: number): void {
  for (let i = 0; i < sel.length; i++) {
    const s = (sel[i]! / 255) * k;
    if (s === 0) continue;
    const o = i * 4;
    const ab = (base[o + 3]! / 255) * (1 - s);
    const af = (filled[o + 3]! / 255) * s;
    const a = ab + af;
    if (a > 0)
      for (let c = 0; c < 3; c++)
        base[o + c] = Math.round((base[o + c]! * ab + filled[o + c]! * af) / a);
    base[o + 3] = Math.round(a * 255);
  }
}

async function fillInWorker(
  api: EditorApi,
  id: LayerId,
  bounds: Rect,
  opacity: number,
  before: Doc,
): Promise<boolean> {
  const size = layerPixelSize(api, id, "image");
  const sel = docRectToLayer(api, id, bounds, "image");
  // Room for the patch search around the selection, as spot healing reads.
  const reach = Math.ceil((Math.max(sel.width, sel.height) + 32) * 3.2);
  const rect = clampRect(
    {
      x: sel.x - reach,
      y: sel.y - reach,
      width: sel.width + 2 * reach,
      height: sel.height + 2 * reach,
    },
    size.width,
    size.height,
  );
  const hole = rect.width > 0 && rect.height > 0 ? selectionInLayer(api, id, rect, "image") : null;
  const base = hole ? api.readRegion(id, "image", rect) : null;
  const filled =
    hole && base
      ? await runJob(api, "image.paint.working", (signal) => {
          const input = {
            width: rect.width,
            height: rect.height,
            data: base.slice(),
            hole: hole.slice(),
          };
          return api.runInWorker(
            { kind: "contentFill", input },
            [input.data.buffer, input.hole.buffer],
            signal,
          );
        })
      : null;
  if (!filled || !hole || !base) {
    if (api.doc() !== before) api.commit("image.select.fill", api.doc(), []); // keep the rasterize undoable
    return false;
  }
  const tracker = createTileTracker(api, id, "image");
  tracker.touch(rect);
  blendThrough(base, filled, hole, opacity / 100);
  api.writeRegion(id, "image", rect, base);
  api.commit("image.select.fill", api.doc(), tracker.tiles());
  return true;
}

/**
 * Content-Aware Fill of the selection on the active layer's image, run in the worker, as one
 * undo step; text and shape layers are rasterized first once the user agrees. Resolves false
 * when there is nothing to fill or the job was stopped.
 */
export function contentAwareFill(api: EditorApi, opacity = 100): Promise<boolean> {
  const layer = fillableLayer(api);
  const bounds = currentSelection(api)?.bounds;
  if (!layer || !bounds) return Promise.resolve(false);
  const before = api.doc();
  return new Promise((resolve, reject) =>
    withRasterized(api, layer.id, "image", () => {
      fillInWorker(api, layer.id, bounds, opacity, before).then(resolve, reject);
    }),
  );
}

type Contents = fillOptions["contents"] | "contentAware";

function FillDialog(props: { api: EditorApi; close(): void }): React.JSX.Element {
  const { api } = props;
  const t = useT(selectPaintMessages);
  const common = useT(commonMessages);
  const { job } = useToolState(api);
  const [contents, setContents] = useState<Contents>("foreground");
  const [opacity, setOpacity] = useState(100);
  const [fillable] = useState(() => fillableLayer(api) !== null);
  const blocked = contents === "contentAware" && !fillable;
  const cancel = (): void => {
    toolState(api).job?.abort();
    props.close();
  };
  const confirm = (): void => {
    if (contents !== "contentAware") {
      applyFill(api, { contents, opacity });
      props.close();
      return;
    }
    contentAwareFill(api, opacity).then(props.close, (e: unknown) => {
      api.showError(toViewerError(e, "render_failed"));
      props.close();
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
      title={t("image.paint.fillTitle")}
      description={blocked ? t("image.paint.fillTooLarge") : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={cancel}>
            {common("common.cancel")}
          </Button>
          <Button variant="primary" disabled={blocked || job !== null} onClick={confirm}>
            {t("image.select.apply")}
          </Button>
        </>
      }
    >
      <ToggleGroup<Contents>
        label={t("image.paint.fillContents")}
        value={contents}
        options={[
          { value: "foreground", label: t("image.paint.fillForeground") },
          { value: "background", label: t("image.paint.fillBackground") },
          { value: "contentAware", label: t("image.paint.fillContentAware") },
        ]}
        onChange={setContents}
      />
      <NumberField
        label={t("image.paint.opacity")}
        value={opacity}
        min={1}
        max={100}
        onChange={setOpacity}
      />
      {job && (
        <>
          <Progress label={t("image.paint.working")} value={null} />
          <Button onClick={() => job.abort()}>{t("image.paint.stop")}</Button>
        </>
      )}
    </Dialog>
  );
}

export function openFillDialog(api: EditorApi): void {
  api.openDialog((close) => <FillDialog api={api} close={close} />);
}
