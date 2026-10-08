import { Select as BaseSelect } from "@base-ui/react/select";
import { Icon } from "./icon";
import { useRoot } from "./root-context";

type Option<T extends string> = { value: T; label: string };

export function Select<T extends string>(props: {
  label: string;
  value: T;
  groups: readonly (readonly Option<T>[])[];
  onChange: (v: T) => void;
}): React.JSX.Element {
  const { portal } = useRoot();
  return (
    <BaseSelect.Root
      value={props.value}
      items={props.groups.flat()}
      onValueChange={(v) => {
        if (v !== null) props.onChange(v as T);
      }}
    >
      <BaseSelect.Trigger aria-label={props.label} className="fv-select">
        <BaseSelect.Value />
        <BaseSelect.Icon className="fv-select-icon">
          <Icon size="sm">
            <path d="M6 9l6 6 6-6" />
          </Icon>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal container={portal}>
        <BaseSelect.Positioner
          positionMethod="fixed"
          alignItemWithTrigger={false}
          sideOffset={4}
          className="fv-select-positioner"
        >
          <BaseSelect.Popup className="fv-select-popup">
            <BaseSelect.List>
              {props.groups.map((group, i) => (
                <div key={group.map((o) => o.value).join("|")} role="presentation">
                  {i > 0 && <BaseSelect.Separator className="fv-select-separator" />}
                  <BaseSelect.Group>
                    {group.map((o) => (
                      <BaseSelect.Item key={o.value} value={o.value} className="fv-select-item">
                        <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                      </BaseSelect.Item>
                    ))}
                  </BaseSelect.Group>
                </div>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
