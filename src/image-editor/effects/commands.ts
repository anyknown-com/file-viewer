import type { Command, Layer, LayerId } from "../api";
import { patchLayer } from "../doc/commands/layers";

export function setEffects(id: LayerId, effects: Layer["effects"] | undefined): Command {
  return patchLayer(id, { effects });
}
