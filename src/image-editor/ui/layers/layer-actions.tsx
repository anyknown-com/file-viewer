import { Button } from "../../../primitives/button";
import { Menu } from "../../../primitives/menu";
import { Tooltip } from "../../../primitives/tooltip";
import type { EditorApi, Layer } from "../../api";
import { ChevronDownIcon, FolderPlusIcon, MaskIcon, PlusIcon, TrashIcon } from "../../glyphs";
import { addLayerMask, deleteLayer, newFolder, newLayer } from "../../layer-ops";
import { menuItems } from "../../registry";
import { useLabel } from "../use-label";

/** The buttons under the layer list, and the extensions' "layer-new" items as a dropdown. */
export function LayerActions(props: {
  api: EditorApi;
  active: Layer | undefined;
}): React.JSX.Element {
  const { api, active } = props;
  const label = useLabel();
  const extra = menuItems("layer-new").map((spec) => ({
    id: spec.id,
    label: label(spec.label),
    disabled: spec.enabled ? !spec.enabled(api) : false,
    onSelect: () => spec.run(api),
  }));
  const button = (
    key:
      | "image.layers.new"
      | "image.layers.newFolder"
      | "image.layers.addMask"
      | "image.layers.delete",
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
  ) => (
    <Tooltip content={label(key)}>
      <Button
        variant="ghost"
        aria-label={label(key)}
        icon={icon}
        disabled={disabled}
        onClick={onClick}
      />
    </Tooltip>
  );
  const canMask = active !== undefined && active.maskFile === undefined;
  return (
    <div className="fv-ie-layer-actions">
      {button("image.layers.new", <PlusIcon />, () => newLayer(api))}
      {extra.length > 0 && (
        <Menu
          items={extra}
          trigger={
            <Button
              variant="ghost"
              aria-label={`${label("image.layers.new")}…`}
              icon={<ChevronDownIcon size="sm" />}
            />
          }
        />
      )}
      {button("image.layers.newFolder", <FolderPlusIcon />, () => newFolder(api))}
      {button(
        "image.layers.addMask",
        <MaskIcon />,
        () => active && addLayerMask(api, active.id),
        !canMask,
      )}
      {button(
        "image.layers.delete",
        <TrashIcon />,
        () => active && deleteLayer(api, active.id),
        !active,
      )}
    </div>
  );
}
