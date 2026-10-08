import { Switch as BaseSwitch } from "@base-ui/react/switch";

export function Switch(props: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <label className="fv-switch-row">
      <BaseSwitch.Root
        checked={props.checked}
        onCheckedChange={(c) => props.onCheckedChange(c)}
        disabled={props.disabled}
        className="fv-switch"
      >
        <BaseSwitch.Thumb className="fv-switch-thumb" />
      </BaseSwitch.Root>
      <span className="fv-switch-label">{props.label}</span>
    </label>
  );
}
