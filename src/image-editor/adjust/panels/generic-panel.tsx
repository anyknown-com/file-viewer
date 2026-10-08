import { useT } from "../../../i18n/use-t";
import { Slider } from "../../../primitives/slider";
import { Switch } from "../../../primitives/switch";
import type { AdjustmentSettings, EditorApi, Layer } from "../../api";
import { setAdjustment } from "../commands";
import { adjustMessages } from "../messages";
import { KIND_KEY } from "../settings";
import { type AdjustColor, fromHex, toHex } from "./color";
import { FIELDS, getPath, resolveAdjustment, setPath } from "./fields";

// React's onChange is the native `input` event; the editor needs `input` (preview) and `change` (commit).
function ColorField(props: {
  label: string;
  value: AdjustColor;
  onPreview: (c: AdjustColor) => void;
  onCommit: (c: AdjustColor) => void;
}): React.JSX.Element {
  const hex = toHex(props.value);
  return (
    <label className="fv-ie-adj-color">
      <span>{props.label}</span>
      <input
        type="color"
        aria-label={props.label}
        ref={(el) => {
          if (!el) return;
          el.value = hex;
          const onInput = () => props.onPreview(fromHex(el.value));
          const onChange = () => props.onCommit(fromHex(el.value));
          el.addEventListener("input", onInput);
          el.addEventListener("change", onChange);
          return () => {
            el.removeEventListener("input", onInput);
            el.removeEventListener("change", onChange);
          };
        }}
      />
    </label>
  );
}

export function GenericPanel({ layer, api }: { layer: Layer; api: EditorApi }): React.JSX.Element {
  const t = useT(adjustMessages);
  const adjustment = layer.adjustment;
  if (!adjustment) return <></>;
  const settings = resolveAdjustment(adjustment);
  const apply = (path: string, value: unknown, label?: "image.adjust.change") => {
    const next = setPath(settings, path, value) as AdjustmentSettings;
    api.dispatch(setAdjustment(layer.id, next), label);
  };
  return (
    <div className="fv-ie-adj-fields">
      {FIELDS[KIND_KEY[settings.kind]].map((field) => {
        const label = t(field.label);
        const value = getPath(settings, field.path);
        if (field.type === "slider") {
          return (
            <div className="fv-ie-adj-field" key={field.path}>
              <span className="fv-ie-adj-label">{label}</span>
              <Slider
                label={label}
                value={value as number}
                min={field.min}
                max={field.max}
                step={field.step}
                onValueChange={(v) => apply(field.path, v)}
                onValueCommitted={(v) => apply(field.path, v, "image.adjust.change")}
              />
            </div>
          );
        }
        if (field.type === "switch") {
          return (
            <Switch
              key={field.path}
              label={label}
              checked={value as boolean}
              onCheckedChange={(c) => apply(field.path, c, "image.adjust.change")}
            />
          );
        }
        return (
          <ColorField
            key={field.path}
            label={label}
            value={value as AdjustColor}
            onPreview={(c) => apply(field.path, c)}
            onCommit={(c) => apply(field.path, c, "image.adjust.change")}
          />
        );
      })}
    </div>
  );
}
