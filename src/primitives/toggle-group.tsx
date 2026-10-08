import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";

export function ToggleGroup<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}): React.JSX.Element {
  return (
    <BaseToggleGroup
      value={[props.value]}
      multiple={false}
      aria-label={props.label}
      className="fv-toggle-group"
      onValueChange={(next) => {
        const v = next[0];
        if (v !== undefined) props.onChange(v as T);
      }}
    >
      {props.options.map((o) => (
        <Toggle key={o.value} value={o.value} className="fv-toggle-group-item">
          {o.icon}
          {o.label}
        </Toggle>
      ))}
    </BaseToggleGroup>
  );
}
