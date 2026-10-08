import { NumberField } from "../../../primitives/number-field";
import { Select } from "../../../primitives/select";
import {
  BLEND_GROUPS,
  type BlendMode,
  type EditorApi,
  type Layer,
  type MessageKey,
} from "../../api";
import { setBlendMode, setOpacity } from "../../doc/commands/index";
import { run } from "../../layer-ops";
import { useLabel } from "../use-label";

/** "Linear Dodge (Add)" → "image.blend.linearDodgeAdd". */
export function blendKey(mode: BlendMode): MessageKey {
  const words = mode.replace(/[()]/g, "").split(" ");
  const camel = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  return `image.blend.${camel}` as MessageKey;
}

/** Blend mode (Compositor's six groups) and opacity of the active layer. */
export function Appearance({ api, layer }: { api: EditorApi; layer: Layer }): React.JSX.Element {
  const label = useLabel();
  const groups = BLEND_GROUPS.map((group) =>
    group.map((mode) => ({ value: mode, label: label(blendKey(mode)) })),
  );
  const id = layer.id;
  return (
    <div className="fv-ie-appearance">
      <Select<BlendMode>
        label={label("image.layers.blendMode")}
        value={layer.blendMode ?? "Normal"}
        groups={groups}
        onChange={(mode) => run(api, setBlendMode(id, mode), "image.layers.blendMode")}
      />
      <NumberField
        label={label("image.layers.opacity")}
        value={Math.round((layer.opacity ?? 1) * 100)}
        min={0}
        max={100}
        step={1}
        // While dragging: a live preview; on release: one undo step.
        onChange={(v) => api.dispatch(setOpacity(id, v / 100))}
        onCommit={(v) => run(api, setOpacity(id, v / 100), "image.layers.opacity")}
      />
    </div>
  );
}
