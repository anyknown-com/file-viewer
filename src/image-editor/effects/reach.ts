import type { LayerEffects } from "../../comp/index";

const on = <T extends { enabled?: boolean }>(e: T | undefined): T | undefined =>
  e && e.enabled !== false ? e : undefined;

/** How far the switched-on effects reach past the layer, in output px at `scale`. */
export function effectsReach(effects: LayerEffects, scale: number): number {
  const stroke = on(effects.stroke);
  const shadow = on(effects.shadow);
  const glow = on(effects.outerGlow);
  return Math.ceil(
    scale *
      Math.max(
        0,
        stroke && !stroke.inside ? stroke.size : 0,
        shadow ? shadow.distance + (3 * shadow.blur) / 2 : 0,
        glow ? (3 * glow.size) / 2 : 0,
      ),
  );
}
