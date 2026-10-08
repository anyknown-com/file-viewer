import { NumberField as BaseNumberField } from "@base-ui/react/number-field";

export function NumberField(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}): React.JSX.Element {
  return (
    <BaseNumberField.Root
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      className="fv-number-field"
      onValueChange={(v) => {
        if (v !== null) props.onChange(v);
      }}
      onValueCommitted={(v) => {
        if (v !== null) props.onCommit?.(v);
      }}
    >
      <BaseNumberField.ScrubArea className="fv-number-field-scrub">
        <span>{props.label}</span>
        <BaseNumberField.ScrubAreaCursor>↔</BaseNumberField.ScrubAreaCursor>
      </BaseNumberField.ScrubArea>
      <BaseNumberField.Group>
        <BaseNumberField.Input aria-label={props.label} className="fv-number-field-input" />
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}
