import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { useRoot } from "./root-context";

export function Tooltip(props: {
  content: string;
  delay?: number;
  children: React.ReactElement;
}): React.JSX.Element {
  const { portal } = useRoot();
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={props.children} delay={props.delay ?? 400} />
      <BaseTooltip.Portal container={portal}>
        <BaseTooltip.Positioner
          positionMethod="fixed"
          sideOffset={6}
          className="fv-tooltip-positioner"
        >
          <BaseTooltip.Popup className="fv-tooltip">{props.content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
