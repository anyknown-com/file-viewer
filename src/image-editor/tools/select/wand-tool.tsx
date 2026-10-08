import { useState } from "react";
import { toViewerError } from "../../../contract/errors";
import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import { NumberField } from "../../../primitives/number-field";
import { Progress } from "../../../primitives/progress";
import { Switch } from "../../../primitives/switch";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type { EditorApi, Point, ToolSpec } from "../../api";
import { apply, layerPixelSize } from "../geom";
import { WandGlyph } from "../glyphs";
import { selectPaintMessages } from "../messages";
import { runJob, useToolState } from "../state";
import { writeLayerSpaceMask } from "./load";
import { opFromEvent, selectOptions, writeSelection } from "./mask";
import { SelectPanel } from "./select-panel";

export type WandOptions = {
  tolerance: number;
  sample: 1 | 3 | 5;
  contiguous: boolean;
  sampleAll: boolean;
};

const options = new WeakMap<EditorApi, WandOptions>();

export function wandOptions(api: EditorApi): WandOptions {
  return options.get(api) ?? { tolerance: 32, sample: 1, contiguous: true, sampleAll: false };
}

export function setWandOptions(api: EditorApi, patch: Partial<WandOptions>): void {
  options.set(api, { ...wandOptions(api), ...patch });
}

/** Selects the pixels like the one at `p` (document space); resolves when the job is done. */
export async function runWand(
  api: EditorApi,
  p: Point,
  mods: { shiftKey: boolean; altKey: boolean },
): Promise<void> {
  const o = wandOptions(api);
  const op = opFromEvent(mods, selectOptions(api).mode);
  const active = api.session().active;
  const all = o.sampleAll;
  if (!all && !active) return;
  let width: number;
  let height: number;
  let data: Uint8Array;
  let point: Point;
  if (all || !active) {
    ({ width, height } = api.doc().manifest);
    data = api.readComposite({ x: 0, y: 0, width, height });
    point = p;
  } else {
    ({ width, height } = layerPixelSize(api, active, "image"));
    data = api.readRegion(active, "image", { x: 0, y: 0, width, height });
    point = apply(api.layerMatrix(active), p);
  }
  const input = {
    width,
    height,
    data,
    x: point.x,
    y: point.y,
    tolerance: o.tolerance,
    sample: o.sample,
    contiguous: o.contiguous,
  };
  const bytes = await runJob(api, "image.select.working", (signal) =>
    api.runInWorker({ kind: "wand", input }, [input.data.buffer], signal),
  );
  if (!bytes) return;
  if (all || !active) writeSelection(api, bytes, { x: 0, y: 0, width, height }, op);
  else writeLayerSpaceMask(api, active, bytes, width, height, op);
  api.requestRender();
}

const SAMPLES = [
  { value: 1, key: "image.select.samplePoint" },
  { value: 3, key: "image.select.sample3" },
  { value: 5, key: "image.select.sample5" },
] as const;

function WandPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const { job } = useToolState(api);
  const [opts, setOpts] = useState(() => wandOptions(api));
  const update = (patch: Partial<WandOptions>): void => {
    setWandOptions(api, patch);
    setOpts(wandOptions(api));
  };
  return (
    <>
      <SelectPanel api={api} />
      <NumberField
        label={t("image.select.tolerance")}
        value={opts.tolerance}
        min={0}
        max={255}
        onChange={(tolerance) => update({ tolerance })}
      />
      <ToggleGroup<1 | 3 | 5>
        label={t("image.select.sample")}
        value={opts.sample}
        options={SAMPLES.map((s) => ({ value: s.value, label: t(s.key) }))}
        onChange={(sample) => update({ sample })}
      />
      <Switch
        label={t("image.select.contiguous")}
        checked={opts.contiguous}
        onCheckedChange={(contiguous) => update({ contiguous })}
      />
      <Switch
        label={t("image.select.sampleAll")}
        checked={opts.sampleAll}
        onCheckedChange={(sampleAll) => update({ sampleAll })}
      />
      {job && (
        <>
          <Progress label={t("image.select.working")} value={null} />
          <Button onClick={() => job.abort()}>{t("image.paint.stop")}</Button>
        </>
      )}
    </>
  );
}

export const wandTool: ToolSpec = {
  id: "select.wand",
  label: "image.select.wand",
  icon: WandGlyph,
  key: "W",
  cursor: "crosshair",
  panel: WandPanel,
  onPointerDown(p, e, api) {
    runWand(api, p, e).catch((error: unknown) =>
      api.showError(toViewerError(error, "render_failed")),
    );
  },
};
