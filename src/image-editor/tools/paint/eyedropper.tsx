import { useState } from "react";
import { useT } from "../../../i18n/use-t";
import { ToggleGroup } from "../../../primitives/toggle-group";
import type { EditorApi, Point, ToolSpec } from "../../api";
import { apply, layerPixelSize, targetMatrix } from "../geom";
import { EyedropperGlyph } from "../glyphs";
import { selectPaintMessages } from "../messages";
import { clampRect } from "../select/resample";
import { setToolState, type RGBA } from "../state";

type Source = "layer" | "all";
type SampleSize = 1 | 3 | 5;
export type EyedropperOptions = { source: Source; size: SampleSize };

/** The average color of the size × size square around (x, y) in RGBA `data`, counting only pixels inside the image. */
export function averageAt(
  data: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  size: SampleSize,
): RGBA {
  const r = (size - 1) / 2;
  const sum = [0, 0, 0, 0];
  let n = 0;
  for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) {
    for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) {
      for (let c = 0; c < 4; c++) sum[c]! += data[(j * w + i) * 4 + c]!;
      n++;
    }
  }
  return sum.map((v) => (n === 0 ? 0 : Math.round(v / n))) as RGBA;
}

const options = new WeakMap<EditorApi, EyedropperOptions>();

export function eyedropperOptions(api: EditorApi): EyedropperOptions {
  return options.get(api) ?? { source: "layer", size: 1 };
}

function setEyedropperOptions(api: EditorApi, patch: Partial<EyedropperOptions>): void {
  options.set(api, { ...eyedropperOptions(api), ...patch });
}

/** The color under `p` (document space) from the active layer or the composite, or null when there is none. */
function sample(api: EditorApi, p: Point): RGBA | null {
  const { source, size } = eyedropperOptions(api);
  const { active } = api.session();
  const layer = api.doc().manifest.layers.find((l) => l.id === active);
  let q = p;
  let w: number;
  let h: number;
  let read: (r: { x: number; y: number; width: number; height: number }) => Uint8Array;
  if (source === "layer") {
    if (!layer || layer.isGroup === true || layer.adjustment !== undefined) return null;
    q = apply(targetMatrix(api, layer.id, "image"), p);
    ({ width: w, height: h } = layerPixelSize(api, layer.id, "image"));
    read = (r) => api.readRegion(layer.id, "image", r);
  } else {
    ({ width: w, height: h } = api.doc().manifest);
    read = (r) => api.readComposite(r);
  }
  const x = Math.floor(q.x);
  const y = Math.floor(q.y);
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const rect = clampRect({ x: x - 2, y: y - 2, width: 5, height: 5 }, w, h);
  return averageAt(read(rect), rect.width, rect.height, x - rect.x, y - rect.y, size);
}

const SAMPLES = [
  { value: "1", key: "image.select.samplePoint" },
  { value: "3", key: "image.select.sample3" },
  { value: "5", key: "image.select.sample5" },
] as const;

function EyedropperPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const [opts, setOpts] = useState(() => eyedropperOptions(api));
  const update = (patch: Partial<EyedropperOptions>): void => {
    setEyedropperOptions(api, patch);
    setOpts(eyedropperOptions(api));
  };
  return (
    <>
      <ToggleGroup<Source>
        label={t("image.paint.source")}
        value={opts.source}
        options={[
          { value: "layer", label: t("image.paint.sourceLayer") },
          { value: "all", label: t("image.paint.sourceAll") },
        ]}
        onChange={(source) => update({ source })}
      />
      <ToggleGroup<"1" | "3" | "5">
        label={t("image.select.sample")}
        value={String(opts.size) as "1" | "3" | "5"}
        options={SAMPLES.map((s) => ({ value: s.value, label: t(s.key) }))}
        onChange={(size) => update({ size: Number(size) as SampleSize })}
      />
    </>
  );
}

export const eyedropperTool: ToolSpec = {
  id: "paint.eyedropper",
  label: "image.paint.eyedropper",
  icon: EyedropperGlyph,
  key: "I",
  cursor: "crosshair",
  panel: EyedropperPanel,
  onPointerDown(p, e, api) {
    const c = sample(api, p);
    if (!c) return;
    const color: RGBA = [c[0], c[1], c[2], 255];
    setToolState(api, e.altKey ? { bg: color } : { fg: color });
  },
};
