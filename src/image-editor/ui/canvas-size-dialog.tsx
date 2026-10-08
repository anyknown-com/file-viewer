// Image > Canvas size: new width and height, and which of nine anchors the old canvas keeps.
import { useState } from "react";
import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Dialog } from "../../primitives/dialog";
import { NumberField } from "../../primitives/number-field";
import { ToggleGroup } from "../../primitives/toggle-group";
import type { EditorApi } from "../api";
import { canvasSize } from "../doc/commands/index";
import { run } from "../layer-ops";
import { MAX_LAYER_SIDE } from "../limits";
import { useLabel } from "./use-label";

type Anchor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
// Row by row from the top left; the arrow points where the old canvas goes.
const ARROWS = ["↖", "↑", "↗", "←", "•", "→", "↙", "↓", "↘"];
const ANCHORS = ARROWS.map((arrow, i) => ({ value: String(i), label: arrow }));

function CanvasSizeDialog(props: { api: EditorApi; close(): void }): React.JSX.Element {
  const { api, close } = props;
  const label = useLabel();
  const common = useT(commonMessages);
  const m = api.doc().manifest;
  const [width, setWidth] = useState(m.width);
  const [height, setHeight] = useState(m.height);
  const [anchor, setAnchor] = useState<Anchor>(4);
  const apply = () => {
    if (width !== m.width || height !== m.height)
      run(api, canvasSize(width, height, anchor), "image.canvas.canvasSize");
    close();
  };
  const side = { min: 1, max: MAX_LAYER_SIDE, step: 1 };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={label("image.canvasSize.title")}
      footer={
        <>
          <Button onClick={close}>{common("common.cancel")}</Button>
          <Button variant="primary" onClick={apply}>
            {label("image.crop.confirm")}
          </Button>
        </>
      }
    >
      <NumberField
        label={label("image.canvasSize.width")}
        value={width}
        {...side}
        onChange={(v) => setWidth(Math.round(v))}
      />
      <NumberField
        label={label("image.canvasSize.height")}
        value={height}
        {...side}
        onChange={(v) => setHeight(Math.round(v))}
      />
      <div className="fv-ie-anchor">
        <ToggleGroup
          label={label("image.canvasSize.anchor")}
          value={String(anchor)}
          options={ANCHORS}
          onChange={(v) => setAnchor(Number(v) as Anchor)}
        />
      </div>
    </Dialog>
  );
}

export function openCanvasSizeDialog(api: EditorApi): void {
  api.openDialog((close) => <CanvasSizeDialog api={api} close={close} />);
}
