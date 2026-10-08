import { useState } from "react";
import { useT } from "../../../i18n/use-t";
import { Select } from "../../../primitives/select";
import { Slider } from "../../../primitives/slider";
import { Switch } from "../../../primitives/switch";
import type { AdjustmentSettings, EditorApi, Layer } from "../../api";
import { setAdjustment } from "../commands";
import { COLOR_RANGES, type ColorRange, readBands, resolveHsv } from "../hue-saturation-bands";
import { adjustMessages } from "../messages";

type Field = "hue" | "saturation" | "lightness";
type HsvSettings = NonNullable<AdjustmentSettings["hsvSettings"]>;

const ROWS = [
  { field: "hue", min: -180, max: 180 },
  { field: "saturation", min: -100, max: 100 },
  { field: "lightness", min: -100, max: 100 },
] as const;

const RANGE_KEY = {
  Master: "master",
  Reds: "reds",
  Yellows: "yellows",
  Greens: "greens",
  Cyans: "cyans",
  Blues: "blues",
  Magentas: "magentas",
} as const satisfies Record<ColorRange, string>;

// Sets one field of one range inside the interleaved [key, value, key, value, …] array, keeping
// the order and any fields this panel does not know.
function withEntry(items: readonly unknown[], range: ColorRange, field: Field, value: number) {
  const next = [...items];
  for (let i = 0; i + 1 < next.length; i += 2) {
    if (next[i] === range) {
      next[i + 1] = { ...(next[i + 1] as object), [field]: value };
      return next;
    }
  }
  return [...next, range, { hue: 0, saturation: 0, lightness: 0, [field]: value }];
}

export function edit(
  s: AdjustmentSettings,
  range: ColorRange,
  field: Field,
  value: number,
): AdjustmentSettings {
  // Master keeps the legacy top-level fields in step; they are what a file without hsvSettings uses.
  const top = range === "Master" ? { [field]: value } : {};
  if (!s.hsvSettings && range === "Master") return { ...s, ...top };
  const hsv: HsvSettings = s.hsvSettings ?? {
    range,
    colorize: s.colorize,
    invertRange: false,
    adjustments: ["Master", { hue: s.hue, saturation: s.saturation, lightness: s.lightness }],
    bands: [],
  };
  return {
    ...s,
    ...top,
    hsvSettings: { ...hsv, range, adjustments: withEntry(hsv.adjustments, range, field, value) },
  };
}

export function HueSaturationPanel({
  layer,
  api,
}: {
  layer: Layer;
  api: EditorApi;
}): React.JSX.Element {
  const t = useT(adjustMessages);
  const [range, setRange] = useState<ColorRange>(
    layer.adjustment ? resolveHsv(layer.adjustment).range : "Master",
  );
  const adjustment = layer.adjustment;
  if (!adjustment) return <></>;
  const current = () => api.doc().manifest.layers.find((l) => l.id === layer.id)?.adjustment;
  const apply = (field: Field, value: number, label?: "image.adjust.change") => {
    const base = current();
    if (base) api.dispatch(setAdjustment(layer.id, edit(base, range, field, value)), label);
  };
  const values = readBands(adjustment).get(range);
  const colorize = (on: boolean) => {
    const base = current();
    if (!base) return;
    const next: AdjustmentSettings = { ...base, colorize: on };
    if (base.hsvSettings) next.hsvSettings = { ...base.hsvSettings, colorize: on };
    api.dispatch(setAdjustment(layer.id, next), "image.adjust.change");
  };
  return (
    <div className="fv-ie-adj-fields">
      <Select
        label={t("image.adjust.hueSaturation.range")}
        value={range}
        groups={[
          COLOR_RANGES.map((r) => ({
            value: r,
            label: t(`image.adjust.hueSaturation.${RANGE_KEY[r]}`),
          })),
        ]}
        onChange={setRange}
      />
      {ROWS.map((row) => {
        const label = t(`image.adjust.hueSaturation.${row.field}`);
        return (
          <div className="fv-ie-adj-field" key={row.field}>
            <span className="fv-ie-adj-label">{label}</span>
            <Slider
              label={label}
              value={values?.[row.field] ?? 0}
              min={row.min}
              max={row.max}
              step={1}
              onValueChange={(v) => apply(row.field, v)}
              onValueCommitted={(v) => apply(row.field, v, "image.adjust.change")}
            />
          </div>
        );
      })}
      <Switch
        label={t("image.adjust.hueSaturation.colorize")}
        checked={resolveHsv(adjustment).colorize}
        onCheckedChange={colorize}
      />
    </div>
  );
}
