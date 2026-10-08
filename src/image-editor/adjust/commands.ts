import type { AdjustmentKind, AdjustmentSettings, Command, Layer, LayerId } from "../api";
import { insertLayer, patchLayer } from "../doc/commands/layers";

type RecordOpts = {
  id: LayerId;
  kind: AdjustmentKind;
  name: string;
  width: number;
  height: number;
  settings: AdjustmentSettings;
  withMask: boolean;
};

/** An adjustment layer covering the whole canvas: no `imageFile`, a `maskFile` when `withMask`. */
export function adjustmentRecord(opts: RecordOpts): Layer {
  const layer: Layer = {
    id: opts.id,
    name: opts.name,
    isVisible: true,
    transform: {
      origin: [0, 0],
      size: [opts.width, opts.height],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "Smooth",
    },
    adjustment: opts.settings,
  };
  if (opts.withMask) layer.maskFile = `${opts.id}.mask.png`;
  return layer;
}

export function addAdjustmentLayer(opts: RecordOpts & { active: LayerId | null }): Command {
  return insertLayer(adjustmentRecord(opts), opts.active);
}

export function setAdjustment(id: LayerId, settings: AdjustmentSettings): Command {
  return patchLayer(id, { adjustment: settings });
}
