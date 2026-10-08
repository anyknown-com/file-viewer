import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { useRoot } from "./root-context";

export function Popover(props: {
  trigger: React.ReactElement;
  label: string;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}): React.JSX.Element {
  const { portal } = useRoot();
  return (
    <BasePopover.Root onOpenChange={(open) => props.onOpenChange?.(open)}>
      <BasePopover.Trigger render={props.trigger} aria-label={props.label} />
      <BasePopover.Portal container={portal}>
        <BasePopover.Positioner
          positionMethod="fixed"
          sideOffset={6}
          className="fv-popover-positioner"
        >
          <BasePopover.Popup aria-label={props.label} className="fv-popover">
            {props.children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
