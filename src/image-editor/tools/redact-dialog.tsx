import { useState } from "react";
import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Dialog } from "../../primitives/dialog";
import { NumberField } from "../../primitives/number-field";
import { ToggleGroup } from "../../primitives/toggle-group";
import type { EditorApi } from "../api";
import { selectPaintMessages } from "./messages";
import { redactSelection } from "./redact";

type Style = "mosaic" | "black";

export function RedactDialog(props: { api: EditorApi; close(): void }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const common = useT(commonMessages);
  const [style, setStyle] = useState<Style>("mosaic");
  const [cell, setCell] = useState(16);
  const retention = t("image.paint.redactRetention");
  const confirm = (): void => {
    redactSelection(props.api, { style, cell });
    props.close();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.close();
      }}
      title={t("image.paint.redactTitle")}
      description={t("image.paint.redactBody")}
      footer={
        <>
          <Button variant="secondary" onClick={props.close}>
            {common("common.cancel")}
          </Button>
          <Button variant="danger" onClick={confirm}>
            {t("image.paint.redactConfirm")}
          </Button>
        </>
      }
    >
      {retention !== "" && <p className="fv-ie-redact-retention">{retention}</p>}
      <ToggleGroup<Style>
        label={t("image.paint.redactStyle")}
        value={style}
        options={[
          { value: "mosaic", label: t("image.paint.redactMosaic") },
          { value: "black", label: t("image.paint.redactBlack") },
        ]}
        onChange={setStyle}
      />
      {style === "mosaic" && (
        <NumberField
          label={t("image.paint.redactCell")}
          value={cell}
          min={2}
          max={200}
          onChange={setCell}
        />
      )}
    </Dialog>
  );
}

export function openRedactDialog(api: EditorApi): void {
  api.openDialog((close) => <RedactDialog api={api} close={close} />);
}
