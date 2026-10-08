import { useRef, useState } from "react";
import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import { Slider } from "../../../primitives/slider";
import type { EditorApi, Layer } from "../../api";
import { setAdjustment } from "../commands";
import { autoLevels, type Histogram, histogram } from "../levels";
import { adjustMessages } from "../messages";
import { readBelow } from "./below";
import { type Channel, ChannelSelect, channelIndex } from "./channel-select";

type Field = "black" | "gamma" | "white" | "outputBlack" | "outputWhite";

const ROWS = [
  { field: "black", key: "inputBlack", min: 0, max: 254, step: 1 },
  { field: "gamma", key: "inputGamma", min: 0.1, max: 9.99, step: 0.01 },
  { field: "white", key: "inputWhite", min: 1, max: 255, step: 1 },
  { field: "outputBlack", key: "outputBlack", min: 0, max: 255, step: 1 },
  { field: "outputWhite", key: "outputWhite", min: 0, max: 255, step: 1 },
] as const satisfies readonly {
  field: Field;
  key: string;
  min: number;
  max: number;
  step: number;
}[];

function HistogramView({ bins, label }: { bins: Uint32Array | null; label: string }) {
  const peak = bins ? Math.max(1, ...bins) : 1;
  const d = bins ? Array.from(bins, (n, i) => `M${i} 100V${100 - (n / peak) * 100}`).join("") : "";
  return (
    <svg
      className="fv-ie-adj-histogram"
      viewBox="0 0 256 100"
      preserveAspectRatio="none"
      aria-label={label}
    >
      <path d={d} />
    </svg>
  );
}

export function LevelsPanel({ layer, api }: { layer: Layer; api: EditorApi }): React.JSX.Element {
  const t = useT(adjustMessages);
  const [channel, setChannel] = useState<Channel>(layer.adjustment?.levels.channel ?? "RGB");
  const [hist, setHist] = useState<Histogram | null>(null);
  const measured = useRef(false);
  const adjustment = layer.adjustment;
  if (!adjustment) return <></>;
  const index = channelIndex(channel);
  const range = adjustment.levels.ranges[index];
  const measure = (el: HTMLElement | null) => {
    if (!el || measured.current) return;
    measured.current = true;
    setHist(histogram(readBelow(api, layer.id)));
  };
  const current = () => api.doc().manifest.layers.find((l) => l.id === layer.id)?.adjustment;
  const apply = (field: Field, value: number, label?: "image.adjust.change") => {
    const base = current();
    if (!base) return;
    const ranges = base.levels.ranges.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    api.dispatch(
      setAdjustment(layer.id, { ...base, levels: { ...base.levels, channel, ranges } }),
      label,
    );
  };
  const bins = hist ? [hist.luma, hist.r, hist.g, hist.b][index] : null;
  return (
    <div className="fv-ie-adj-fields" ref={measure}>
      <ChannelSelect value={channel} onChange={setChannel} />
      <HistogramView bins={bins ?? null} label={t("image.adjust.levels.histogram")} />
      {ROWS.map((row) => {
        const label = t(`image.adjust.levels.${row.key}`);
        return (
          <div className="fv-ie-adj-field" key={row.field}>
            <span className="fv-ie-adj-label">{label}</span>
            <Slider
              label={label}
              value={range?.[row.field] ?? 0}
              min={row.min}
              max={row.max}
              step={row.step}
              onValueChange={(v) => apply(row.field, v)}
              onValueCommitted={(v) => apply(row.field, v, "image.adjust.change")}
            />
          </div>
        );
      })}
      <Button
        disabled={!hist}
        onClick={() => {
          if (hist)
            api.dispatch(
              setAdjustment(layer.id, autoLevels(hist, current() ?? adjustment)),
              "image.adjust.change",
            );
        }}
      >
        {t("image.adjust.levels.auto")}
      </Button>
    </div>
  );
}
