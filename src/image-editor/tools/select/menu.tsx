import { useState } from "react";
import { commonMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import { Dialog } from "../../../primitives/dialog";
import { NumberField } from "../../../primitives/number-field";
import type { EditorApi, MenuItemSpec, MessageKey, PixelTarget } from "../../api";
import { registerLayerDecor, registerMenuItem, registerOverlay } from "../../registry";
import { selectPaintMessages } from "../messages";
import { antsSegments, drawAnts } from "./ants";
import { loadLayerAlpha } from "./load";
import {
  deselect,
  hasSelection,
  invertSelection,
  type MaskOp,
  readSelection,
  reselect,
  selectAll,
  selectionOf,
} from "./mask";
import { contractSelection, expandSelection, featherSelection } from "./morph";

type AmountKey = "image.select.expand" | "image.select.contract" | "image.select.featherMenu";

function AmountDialog(props: {
  title: AmountKey;
  min: number;
  max: number;
  initial: number;
  onApply(amount: number): void;
  close(): void;
}): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const common = useT(commonMessages);
  const [amount, setAmount] = useState(props.initial);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.close();
      }}
      title={t(props.title)}
      footer={
        <>
          <Button variant="secondary" onClick={props.close}>
            {common("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              props.onApply(amount);
              props.close();
            }}
          >
            {t("image.select.apply")}
          </Button>
        </>
      }
    >
      <NumberField
        label={t("image.select.amount")}
        value={amount}
        min={props.min}
        max={props.max}
        onChange={setAmount}
      />
    </Dialog>
  );
}

function amountItem(
  id: string,
  title: AmountKey,
  range: { min: number; max: number; initial: number },
  apply: (api: EditorApi, amount: number) => void,
): void {
  registerMenuItem({
    id,
    menu: "select",
    label: title,
    enabled: hasSelection,
    run(api) {
      api.openDialog((close) => (
        <AmountDialog {...range} title={title} onApply={(n) => apply(api, n)} close={close} />
      ));
    },
  });
}

function opOf(mods: { shift: boolean; alt: boolean }): MaskOp {
  if (mods.shift && mods.alt) return "intersect";
  if (mods.shift) return "add";
  if (mods.alt) return "subtract";
  return "replace";
}

const item = (
  id: string,
  label: MessageKey,
  run: (api: EditorApi) => void,
  extra: Partial<MenuItemSpec> = {},
): void => registerMenuItem({ id, menu: "select", label, run, ...extra });

const ants = new WeakMap<EditorApi, { version: number; segments: Float32Array }>();

export function registerSelectMenu(): void {
  item("select.all", "image.select.all", selectAll, { shortcut: "Mod+A" });
  item("select.deselect", "image.select.deselect", deselect, {
    shortcut: "Mod+D",
    enabled: hasSelection,
  });
  item("select.reselect", "image.select.reselect", reselect, { shortcut: "Mod+Shift+D" });
  item("select.inverse", "image.select.inverse", invertSelection, { shortcut: "Mod+Shift+I" });
  amountItem(
    "select.expand",
    "image.select.expand",
    { min: 1, max: 500, initial: 1 },
    expandSelection,
  );
  amountItem(
    "select.contract",
    "image.select.contract",
    { min: 1, max: 500, initial: 1 },
    contractSelection,
  );
  amountItem(
    "select.feather",
    "image.select.featherMenu",
    { min: 0.5, max: 250, initial: 5 },
    featherSelection,
  );
  item(
    "select.loadAlpha",
    "image.select.loadAlpha",
    (api) => {
      const { active, target } = api.session();
      if (active) loadLayerAlpha(api, active, target, "replace");
    },
    { enabled: (api: EditorApi) => api.session().active !== null },
  );

  registerOverlay({
    id: "select.ants",
    animated: hasSelection,
    draw(ctx, view, api, time) {
      if (!hasSelection(api)) return;
      const sel = selectionOf(api);
      let cached = ants.get(api);
      if (!cached || cached.version !== sel.version) {
        cached = {
          version: sel.version,
          segments: antsSegments(readSelection(api), sel.width, sel.height),
        };
        ants.set(api, cached);
      }
      drawAnts(ctx, cached.segments, view, time);
    },
  });

  registerLayerDecor({
    id: "select.thumbnailLoad",
    onThumbnailClick(layer, target: PixelTarget, mods, api) {
      if (!mods.mod) return false;
      loadLayerAlpha(api, layer.id, target, opOf(mods));
      return true;
    },
  });
}
