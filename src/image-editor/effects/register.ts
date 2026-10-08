import { registerEffects } from "../registry";
import { effectsReach } from "./reach";
import { renderEffects } from "./render";

export function registerLayerEffects(): void {
  registerEffects({ pass: renderEffects, reach: effectsReach });
}
