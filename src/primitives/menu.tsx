import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cx } from "./cx";
import { useRoot } from "./root-context";

export type MenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export function Menu(props: {
  trigger: React.ReactElement;
  items: readonly MenuItem[];
}): React.JSX.Element {
  const { portal } = useRoot();
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={props.trigger} />
      <BaseMenu.Portal container={portal}>
        <BaseMenu.Positioner
          positionMethod="fixed"
          sideOffset={4}
          align="start"
          className="fv-menu-positioner"
        >
          <BaseMenu.Popup className="fv-menu">
            {props.items.map((item) => (
              <BaseMenu.Item
                key={item.id}
                disabled={item.disabled}
                onClick={item.onSelect}
                className={cx("fv-menu-item", item.danger && "fv-menu-item-danger")}
              >
                {item.label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
