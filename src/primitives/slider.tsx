import { Slider as BaseSlider } from "@base-ui/react/slider";

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  onValueCommitted?: (value: number) => void;
}): React.JSX.Element {
  return (
    <BaseSlider.Root
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      disabled={props.disabled}
      onValueChange={(v) => props.onValueChange(v)}
      onValueCommitted={props.onValueCommitted ? (v) => props.onValueCommitted?.(v) : undefined}
      className="fv-slider"
    >
      <BaseSlider.Control className="fv-slider-control">
        <BaseSlider.Track className="fv-slider-track">
          <BaseSlider.Indicator className="fv-slider-indicator" />
          <BaseSlider.Thumb aria-label={props.label} className="fv-slider-thumb" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
