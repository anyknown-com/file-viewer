import { useState } from "react";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Select } from "../../primitives/select";
import { Slider } from "../../primitives/slider";
import { Switch } from "../../primitives/switch";
import type { EditorApi, Layer } from "../api";
import { ColorField } from "../adjust/panels/generic-panel";
import { type AdjustMessages, adjustMessages } from "../adjust/messages";
import { setEffects } from "./commands";
import { defaultEffect, EFFECT_NAMES, EFFECT_RANGES, type EffectName } from "./defaults";
import { EFFECT_FIELDS } from "./fields";
import { focusEffects, useEffectsFocus } from "./focus";

type Effect = Record<string, number | boolean>;
type Label = "image.effects.change";

function EffectRow(props: { name: EffectName; api: EditorApi; layer: Layer }): React.JSX.Element {
  const { name, api, layer } = props;
  const t = useT(adjustMessages);
  const [open, setOpen] = useState(false);
  const effect = layer.effects?.[name] as Effect | undefined;
  const on = effect !== undefined && effect.enabled !== false;
  const write = (next: Effect, label?: Label) => {
    const effects = { ...layer.effects, [name]: next } as NonNullable<Layer["effects"]>;
    api.dispatch(setEffects(layer.id, effects), label);
  };
  const ranges = EFFECT_RANGES[name] as Record<string, { min: number; max: number }>;
  const title = t(`image.effects.${name}` as keyof AdjustMessages);
  return (
    <div className="fv-ie-adj-effect">
      <div className="fv-ie-adj-effect-head">
        <Switch
          label={title}
          checked={on}
          onCheckedChange={(c) =>
            write(
              effect ? { ...effect, enabled: c } : (defaultEffect(name) as unknown as Effect),
              "image.effects.change",
            )
          }
        />
        <Button
          variant="ghost"
          aria-label={t("image.effects.expand")}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "−" : "+"}
        </Button>
      </div>
      {open && effect ? (
        <div className="fv-ie-adj-fields">
          {EFFECT_FIELDS[name].map((field) => {
            const label = t(field.label);
            if (field.type === "slider") {
              const range = ranges[field.key] ?? { min: 0, max: 1 };
              return (
                <div className="fv-ie-adj-field" key={field.key}>
                  <span className="fv-ie-adj-label">{label}</span>
                  <Slider
                    label={label}
                    value={effect[field.key] as number}
                    min={range.min}
                    max={range.max}
                    step={field.step}
                    onValueChange={(v) => write({ ...effect, [field.key]: v })}
                    onValueCommitted={(v) =>
                      write({ ...effect, [field.key]: v }, "image.effects.change")
                    }
                  />
                </div>
              );
            }
            if (field.type === "color") {
              const rgb = {
                red: effect.red as number,
                green: effect.green as number,
                blue: effect.blue as number,
              };
              return (
                <ColorField
                  key={field.key}
                  label={label}
                  value={rgb}
                  onPreview={(c) => write({ ...effect, ...c })}
                  onCommit={(c) => write({ ...effect, ...c }, "image.effects.change")}
                />
              );
            }
            return (
              <div className="fv-ie-adj-field" key={field.key}>
                <span className="fv-ie-adj-label">{label}</span>
                <Select
                  label={label}
                  value={effect.inside ? "inside" : "outside"}
                  groups={[
                    [
                      { value: "inside", label: t("image.effects.stroke.inside") },
                      { value: "outside", label: t("image.effects.stroke.outside") },
                    ],
                  ]}
                  onChange={(v) =>
                    write({ ...effect, inside: v === "inside" }, "image.effects.change")
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function EffectsPanel({ api, layer }: { api: EditorApi; layer: Layer }): React.JSX.Element {
  const t = useT(adjustMessages);
  const wanted = useEffectsFocus() === layer.id;
  return (
    <section
      className="fv-ie-adj-effects"
      aria-label={t("image.effects.open")}
      ref={(el) => {
        if (!el || !wanted) return;
        el.scrollIntoView?.({ block: "nearest" });
        el.querySelector<HTMLElement>("[role='switch']")?.focus();
        focusEffects(null);
      }}
    >
      {EFFECT_NAMES.map((name) => (
        <EffectRow key={name} name={name} api={api} layer={layer} />
      ))}
    </section>
  );
}
