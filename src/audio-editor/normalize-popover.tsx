import { useState } from "react";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { Popover } from "../primitives/popover";
import { Slider } from "../primitives/slider";
import { type AudioEdit, gain, outputDuration, type Range } from "./edit";
import { NormalizeIcon } from "./glyphs";
import { audioMessages } from "./messages";
import { NORMALIZE_DEFAULT_DB, normalizeGain } from "./normalize";
import type { Peaks } from "./peaks";

export type NormalizePopoverProps = {
  peaks: Peaks | null;
  selection: Range | null;
  state: AudioEdit;
  onApply: (next: AudioEdit) => void;
};

function NormalizePanel(props: NormalizePopoverProps & { peaks: Peaks }): React.JSX.Element {
  const t = useT(audioMessages);
  const [target, setTarget] = useState(NORMALIZE_DEFAULT_DB);
  const apply = () => {
    // No selection normalizes the whole timeline.
    const range = props.selection ?? { start: 0, end: outputDuration(props.state) };
    const db = normalizeGain(props.peaks, props.state, range, target);
    props.onApply(gain(props.state, range, db));
  };
  return (
    <div className="fv-audio-panel">
      <div className="fv-audio-panel-row">
        <span>{t("audio.normalizeTarget")}</span>
        <output>{`${target.toFixed(1)} dBFS`}</output>
      </div>
      <Slider
        label={t("audio.normalizeTarget")}
        value={target}
        min={-6}
        max={0}
        step={0.1}
        onValueChange={setTarget}
      />
      <Button variant="primary" onClick={apply}>
        {t("audio.apply")}
      </Button>
    </div>
  );
}

export function NormalizePopover(props: NormalizePopoverProps): React.JSX.Element {
  const t = useT(audioMessages);
  const label = t("audio.normalize");
  return (
    <Popover
      label={label}
      trigger={
        <Button variant="ghost" icon={<NormalizeIcon />} disabled={props.peaks === null}>
          <span className="fv-audio-tool-label">{label}</span>
        </Button>
      }
    >
      {props.peaks && <NormalizePanel {...props} peaks={props.peaks} />}
    </Popover>
  );
}
