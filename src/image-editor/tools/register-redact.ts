import { registerMenuItem } from "../registry";
import { openRedactDialog } from "./redact-dialog";
import { hasSelection } from "./select/mask";

export function registerRedact(): void {
  registerMenuItem({
    id: "image.redact",
    menu: "image",
    label: "image.paint.redact",
    enabled: hasSelection,
    run: openRedactDialog,
  });
}
