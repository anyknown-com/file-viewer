// Image editor limits. previewBytes and projectBytes are 02's Limits (useRoot().limits).
export const MAX_LAYER_SIDE = 30_000;
export const IMAGE_MAX_PIXELS = 40_000_000;
export const PIXEL_BUDGET_DESKTOP = 200_000_000;
export const PIXEL_BUDGET_COARSE = 50_000_000;
export const EXPORT_MAX_PIXELS = 100_000_000;
export const PREVIEW_MAX_PIXELS = 50_000_000;
export const UNDO_MAX_STEPS = 100;
export const UNDO_MAX_BYTES = 256 * 1024 ** 2;
export const TILE = 256;
export const EXPORT_TILE = 2048;
export const VIEW_MAX_PIXELS = 4_000_000;
export const BUFFER_POOL_MAX = 8;
export const BUFFER_MAX_BYTES = 32 * 1024 ** 2;

// Layer pixels and mask pixels each stay under this total.
export function pixelBudget(): number {
  if (typeof matchMedia !== "function") return PIXEL_BUDGET_DESKTOP;
  return matchMedia("(pointer: coarse)").matches ? PIXEL_BUDGET_COARSE : PIXEL_BUDGET_DESKTOP;
}
