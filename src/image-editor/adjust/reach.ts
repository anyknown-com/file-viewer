import type { AdjustmentSettings } from "../api";

// LayerAdjustment.swift: `gaussianRadius` and `resolvedMotionDistance` default to 10.
export const blurRadiusOf = (s: AdjustmentSettings): number => s.blurRadius ?? 10;
export const motionDistanceOf = (s: AdjustmentSettings): number => s.motionDistance ?? 10;

/** How far a blur reaches outward, in output px at `scale`; 0 for every other kind. */
export function blurReach(s: AdjustmentSettings, scale: number): number {
  if (s.kind === "Gaussian Blur") return Math.ceil(3 * blurRadiusOf(s) * scale);
  if (s.kind === "Motion Blur") return Math.ceil((motionDistanceOf(s) / 2) * scale);
  return 0;
}
