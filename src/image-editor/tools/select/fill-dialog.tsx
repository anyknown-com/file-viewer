import { useState } from "react";
import { commonMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import { Dialog } from "../../../primitives/dialog";
import { NumberField } from "../../../primitives/number-field";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type { EditorApi } from "../../api";
import { selectPaintMessages } from "../messages";
import { toolState } from "../state";
import { editSelected } from "./pixel-edit";

export type fillOptions = {
  contents: "foreground" | "background" | "contentAware";
  opacity: number;
};

/** Fills the selection (the whole layer without one) with the foreground or background color. */
export function applyFill(api: EditorApi, opts: fillOptions): boolean {
  if (opts.contents === "contentAware") return false; // P03-3
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

function FillDialog(props: { api: EditorApi; close(): void }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const common = useT(commonMessages);
  const [contents, setContents] = useState<"foreground" | "background">("foreground");
  const [opacity, setOpacity] = useState(100);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.close();
      }}
      title={t("image.paint.fillTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={props.close}>
            {common("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              applyFill(props.api, { contents, opacity });
              props.close();
            }}
          >
            {t("image.select.apply")}
          </Button>
        </>
      }
    >
      <ToggleGroup
        label={t("image.paint.fillContents")}
        value={contents}
        options={[
          { value: "foreground", label: t("image.paint.fillForeground") },
          { value: "background", label: t("image.paint.fillBackground") },
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
    </Dialog>
  );
}

export function openFillDialog(api: EditorApi): void {
  api.openDialog((close) => <FillDialog api={api} close={close} />);
}
