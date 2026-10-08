import { useState } from "react";
import { useT } from "../../../i18n/use-t";
import { NumberField } from "../../../primitives/number-field";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type { EditorApi } from "../../api";
import { selectPaintMessages } from "../messages";
import { floating, setFloatAngle, setFloatScale } from "./floating";
import { useToolState } from "../state";
import { type MaskOp, selectOptions, setSelectOptions } from "./mask";

const MODES: readonly {
  value: MaskOp;
  key:
    | "image.select.modeNew"
    | "image.select.modeAdd"
    | "image.select.modeSubtract"
    | "image.select.modeIntersect";
}[] = [
  { value: "replace", key: "image.select.modeNew" },
  { value: "add", key: "image.select.modeAdd" },
  { value: "subtract", key: "image.select.modeSubtract" },
  { value: "intersect", key: "image.select.modeIntersect" },
];

export function SelectPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  useToolState(api);
  const float = floating(api);
  const [opts, setOpts] = useState(() => selectOptions(api));
  const update = (patch: Partial<typeof opts>): void => {
    setSelectOptions(api, patch);
    setOpts(selectOptions(api));
  };
  return (
    <>
      <ToggleGroup<MaskOp>
        label={t("image.select.mode")}
        value={opts.mode}
        options={MODES.map((m) => ({ value: m.value, label: t(m.key) }))}
        onChange={(mode) => update({ mode })}
      />
      <NumberField
        label={t("image.select.feather")}
        value={opts.feather}
        min={0}
        max={250}
        onChange={(feather) => update({ feather })}
      />
      {float && (
        <>
          <NumberField
            label={t("image.select.scale")}
            value={Math.round(float.scale * 100)}
            min={1}
            max={1000}
            onChange={(v) => setFloatScale(api, v / 100)}
          />
          <NumberField
            label={t("image.select.angle")}
            value={float.angle}
            min={-180}
            max={180}
            onChange={(v) => setFloatAngle(api, v)}
          />
        </>
      )}
    </>
  );
}
