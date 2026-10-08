import { ContextMenu } from "../../../primitives/context-menu";
import type { MenuItem } from "../../../primitives/menu";
import type { EditorApi, Layer } from "../../api";
import {
  deleteLayer,
  deleteMask,
  duplicate,
  group,
  invertMask,
  isFolder,
  linkMask,
  setMaskOn,
  toggleClip,
  ungroupFolder,
} from "../../layer-ops";
import { menuItems } from "../../registry";
import { useLabel } from "../use-label";

/** The layer row's right-click menu: the fixed items, then the extensions' "layer-context" items. */
export function LayerMenu(props: {
  api: EditorApi;
  layer: Layer;
  children: React.ReactElement;
}): React.JSX.Element {
  const { api, layer } = props;
  const label = useLabel();
  const id = layer.id;
  const folder = isFolder(layer);
  const clipped = layer.maskSourceID !== undefined;
  const masked = layer.maskFile !== undefined;
  const maskOn = layer.maskEnabled !== false;
  const linked = layer.maskLinked !== false;
  const items: MenuItem[] = [
    { id: "duplicate", label: label("image.layers.duplicate"), onSelect: () => duplicate(api, id) },
    { id: "delete", label: label("image.layers.delete"), onSelect: () => deleteLayer(api, id) },
    { id: "group", label: label("image.layers.group"), onSelect: () => group(api, id) },
    {
      id: "ungroup",
      label: label("image.layers.ungroup"),
      disabled: !folder,
      onSelect: () => ungroupFolder(api, id),
    },
    {
      id: "clip",
      label: label(clipped ? "image.layers.unclip" : "image.layers.clip"),
      disabled: folder,
      onSelect: () => toggleClip(api, id),
    },
  ];
  if (masked) {
    items.push(
      {
        id: "mask-enabled",
        label: label(maskOn ? "image.layers.maskDisable" : "image.layers.maskEnable"),
        onSelect: () => setMaskOn(api, id, !maskOn),
      },
      {
        id: "mask-delete",
        label: label("image.layers.maskDelete"),
        onSelect: () => deleteMask(api, id),
      },
      {
        id: "mask-invert",
        label: label("image.layers.maskInvert"),
        onSelect: () => invertMask(api, id),
      },
      {
        id: "mask-link",
        label: label(linked ? "image.layers.maskUnlink" : "image.layers.maskLink"),
        onSelect: () => linkMask(api, id, !linked),
      },
    );
  }
  for (const spec of menuItems("layer-context")) {
    items.push({
      id: spec.id,
      label: label(spec.label),
      disabled: spec.enabled ? !spec.enabled(api) : false,
      onSelect: () => spec.run(api),
    });
  }
  return <ContextMenu items={items}>{props.children}</ContextMenu>;
}
