// Export: PNG, JPEG or WebP at full size, without EXIF, in sRGB.
import { useState } from "react";
import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Dialog } from "../../primitives/dialog";
import { Slider } from "../../primitives/slider";
import { ToggleGroup } from "../../primitives/toggle-group";
import type { EditorApi } from "../api";
import { EXPORT_MAX_PIXELS } from "../limits";
import { useLabel } from "../ui/use-label";
import { usableCanvas } from "./flatten";
import type { Saver } from "./save";

type Format = "png" | "jpeg" | "webp";
export type ExportChoice = { type: Format; quality: number };

export function ExportDialog(props: {
  open: boolean;
  onExport(choice: ExportChoice): void;
  onCancel(): void;
  /** False when the browser cannot make a canvas this size: only PNG. */
  canvasOk: boolean;
  /** The canvas is over EXPORT_MAX_PIXELS: nothing to export. */
  tooLarge: boolean;
}): React.JSX.Element {
  const label = useLabel();
  const common = useT(commonMessages);
  const [type, setType] = useState<Format>("png");
  const [quality, setQuality] = useState(0.92);
  const formats: Format[] = props.canvasOk ? ["png", "jpeg", "webp"] : ["png"];
  const options = formats.map((f) => ({ value: f, label: label(`image.export.${f}`) }));
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
      title={label("image.export.title")}
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel}>
            {common("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={props.tooLarge}
            onClick={() => props.onExport({ type, quality })}
          >
            {label("image.export.confirm")}
          </Button>
        </>
      }
    >
      {props.tooLarge ? (
        <p className="fv-ie-save-hint">{label("image.export.tooLarge")}</p>
      ) : (
        <div className="fv-ie-export">
          <ToggleGroup
            label={label("image.export.title")}
            value={type}
            options={options}
            onChange={setType}
          />
          {type !== "png" && (
            <Slider
              label={label("image.export.quality")}
              value={quality}
              min={0.1}
              max={1}
              step={0.01}
              onValueChange={setQuality}
            />
          )}
          {!props.canvasOk && (
            <p className="fv-ie-save-hint">{label("image.export.formatUnavailable")}</p>
          )}
          <p className="fv-ie-save-hint">{label("image.export.noExif")}</p>
          <p className="fv-ie-save-hint">{label("image.export.srgb")}</p>
        </div>
      )}
    </Dialog>
  );
}

/** Opens ExportDialog in the editor and exports with the saver on confirm. */
export function openExportDialog(api: EditorApi, saver: Saver): void {
  const { width, height } = api.doc().manifest;
  const tooLarge = width * height > EXPORT_MAX_PIXELS;
  const canvasOk = !tooLarge && usableCanvas(width, height) !== null;
  api.openDialog((close) => (
    <ExportDialog
      open
      tooLarge={tooLarge}
      canvasOk={canvasOk}
      onCancel={close}
      onExport={(choice) => {
        close();
        void saver.exportAs(choice);
      }}
    />
  ));
}
