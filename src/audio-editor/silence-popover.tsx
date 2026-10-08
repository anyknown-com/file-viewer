import { useState } from "react";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { Popover } from "../primitives/popover";
import { Slider } from "../primitives/slider";
import { type AudioEdit, cut, type Range } from "./edit";
import { SilenceIcon } from "./glyphs";
import { audioMessages } from "./messages";
import type { Peaks } from "./peaks";
import { findSilence, SILENCE_DEFAULTS } from "./silence";

export type SilencePopoverProps = {
  peaks: Peaks | null;
  state: AudioEdit;
  onMark: (ranges: Range[]) => void;
  onApply: (next: AudioEdit) => void;
};

type Settings = typeof SILENCE_DEFAULTS;

export function SilencePopover(props: SilencePopoverProps): React.JSX.Element {
  const t = useT(audioMessages);
  const [settings, setSettings] = useState<Settings>(SILENCE_DEFAULTS);
  const [ranges, setRanges] = useState<Range[]>([]);
  const label = t("audio.removeSilence");

  const markWith = (state: AudioEdit, s: Settings) => {
    const found = props.peaks ? findSilence(props.peaks, state, s) : [];
    setRanges(found);
    props.onMark(found);
  };
  const change = (s: Settings) => {
    setSettings(s);
    markWith(props.state, s);
  };
  const remove = () => {
    // Back to front so the earlier ranges keep their output times; one onApply = one undo step.
    let next = props.state;
    for (let i = ranges.length - 1; i >= 0; i--) next = cut(next, ranges[i]);
    props.onApply(next);
    markWith(next, settings);
  };

  return (
    <Popover
      label={label}
      onOpenChange={(open) => {
        if (open) markWith(props.state, settings);
        else props.onMark([]);
      }}
      trigger={
        <Button variant="ghost" icon={<SilenceIcon />} disabled={props.peaks === null}>
          <span className="fv-audio-tool-label">{label}</span>
        </Button>
      }
    >
      <div className="fv-audio-panel">
        <div className="fv-audio-panel-row">
          <span>{t("audio.silenceThreshold")}</span>
          <output>{`${settings.thresholdDb} dBFS`}</output>
        </div>
        <Slider
          label={t("audio.silenceThreshold")}
          value={settings.thresholdDb}
          min={-70}
          max={-20}
          step={1}
          onValueChange={(v) => change({ ...settings, thresholdDb: v })}
        />
        <div className="fv-audio-panel-row">
          <span>{t("audio.silenceMinLength")}</span>
          <output>{`${settings.minSeconds.toFixed(1)} s`}</output>
        </div>
        <Slider
          label={t("audio.silenceMinLength")}
          value={settings.minSeconds}
          min={0.3}
          max={5}
          step={0.1}
          onValueChange={(v) => change({ ...settings, minSeconds: v })}
        />
        <p className="fv-audio-panel-note">{t("audio.silenceFound", { count: ranges.length })}</p>
        <Button variant="danger" disabled={ranges.length === 0} onClick={remove}>
          {t("audio.silenceRemove")}
        </Button>
      </div>
    </Popover>
  );
}
