import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Menubar as BaseMenubar } from "@base-ui/react/menubar";
import { cx } from "./cx";
import type { MenuItem } from "./menu";
import { useRoot } from "./root-context";

export function Menubar(props: {
  menus: readonly {
    id: string;
    label: string;
    items: readonly (MenuItem & { shortcut?: string })[];
  }[];
}): React.JSX.Element {
  const { portal } = useRoot();
  return (
    <BaseMenubar className="fv-menubar">
      {props.menus.map((menu) => (
        <BaseMenu.Root key={menu.id}>
          <BaseMenu.Trigger className="fv-menubar-trigger">{menu.label}</BaseMenu.Trigger>
          <BaseMenu.Portal container={portal}>
            <BaseMenu.Positioner
              positionMethod="fixed"
              sideOffset={4}
              align="start"
              className="fv-menu-positioner"
            >
              <BaseMenu.Popup className="fv-menu">
                {menu.items.map((item) => (
                  <BaseMenu.Item
                    key={item.id}
                    disabled={item.disabled}
                    onClick={item.onSelect}
                    className={cx("fv-menu-item", item.danger && "fv-menu-item-danger")}
                  >
                    {item.label}
                    {item.shortcut && <span className="fv-menubar-shortcut">{item.shortcut}</span>}
                  </BaseMenu.Item>
                ))}
              </BaseMenu.Popup>
            </BaseMenu.Positioner>
          </BaseMenu.Portal>
        </BaseMenu.Root>
      ))}
    </BaseMenubar>
  );
}
