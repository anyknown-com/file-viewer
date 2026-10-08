import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { useId } from "react";

type Option<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

function RadioItem<T extends string>({ option }: { option: Option<T> }): React.JSX.Element {
  const labelId = useId();
  const descId = useId();
  return (
    <div className="fv-radio-item">
      <Radio.Root
        value={option.value}
        disabled={option.disabled}
        aria-labelledby={labelId}
        aria-describedby={option.description ? descId : undefined}
        className="fv-radio"
      >
        <Radio.Indicator className="fv-radio-indicator" />
      </Radio.Root>
      <span id={labelId} className="fv-radio-label">
        {option.label}
      </span>
      {option.description && (
        <span id={descId} className="fv-radio-description">
          {option.description}
        </span>
      )}
    </div>
  );
}

export function RadioGroup<T extends string>(props: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
}): React.JSX.Element {
  return (
    <BaseRadioGroup
      value={props.value}
      aria-label={props.label}
      className="fv-radio-group"
      onValueChange={(v) => props.onChange(v as T)}
    >
      {props.options.map((o) => (
        <RadioItem key={o.value} option={o} />
      ))}
    </BaseRadioGroup>
  );
}
