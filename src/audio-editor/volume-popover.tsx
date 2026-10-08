import { useState } from "react";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { Popover } from "../primitives/popover";
import { Slider } from "../primitives/slider";
import { type AudioEdit, gain, type Range } from "./edit";
import { VolumeIcon } from "./glyphs";
import { audioMessages } from "./messages";

export type VolumePopoverProps = {
  selection: Range | null;
  state: AudioEdit;
  onApply: (next: AudioEdit) => void;
};

function VolumePanel(props: VolumePopoverProps & { selection: Range }): React.JSX.Element {
  const t = useT(audioMessages);
  const [db, setDb] = useState(0);
  return (
    <div className="fv-audio-panel">
      <div className="fv-audio-panel-row">
        <span>{t("audio.volume")}</span>
        <output>{`${db > 0 ? "+" : ""}${db.toFixed(1)} dB`}</output>
      </div>
      <Slider
        label={t("audio.volume")}
        value={db}
        min={-24}
        max={12}
        step={0.5}
        onValueChange={setDb}
      />
      <Button
        variant="primary"
        onClick={() => props.onApply(gain(props.state, props.selection, db))}
      >
        {t("audio.apply")}
      </Button>
    </div>
  );
}

export function VolumePopover(props: VolumePopoverProps): React.JSX.Element {
  const t = useT(audioMessages);
  const label = t("audio.volume");
  return (
    <Popover
      label={label}
      trigger={
        <Button variant="ghost" icon={<VolumeIcon />} disabled={props.selection === null}>
          <span className="fv-audio-tool-label">{label}</span>
        </Button>
      }
    >
      {props.selection && <VolumePanel {...props} selection={props.selection} />}
    </Popover>
  );
}
