import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import { cx } from "./cx";
import type { MenuItem } from "./menu";
import { useRoot } from "./root-context";

export function ContextMenu(props: {
  items: readonly MenuItem[];
  children: React.ReactElement;
}): React.JSX.Element {
  const { portal } = useRoot();
  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger render={props.children} />
      <BaseContextMenu.Portal container={portal}>
        <BaseContextMenu.Positioner positionMethod="fixed" className="fv-menu-positioner">
          <BaseContextMenu.Popup className="fv-menu">
            {props.items.map((item) => (
              <BaseContextMenu.Item
                key={item.id}
                disabled={item.disabled}
                onClick={item.onSelect}
                className={cx("fv-menu-item", item.danger && "fv-menu-item-danger")}
              >
                {item.label}
              </BaseContextMenu.Item>
            ))}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
}
