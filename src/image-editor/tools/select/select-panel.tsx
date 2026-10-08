import { useState } from "react";
import { useT } from "../../../i18n/use-t";
import { NumberField } from "../../../primitives/number-field";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type { EditorApi } from "../../api";
import { selectPaintMessages } from "../messages";
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
    </>
  );
}
