import type { LayerEffects } from "../../comp/index";

let copied: LayerEffects | null = null;

export function copyEffects(e: LayerEffects): void {
  copied = structuredClone(e);
}

export function copiedEffects(): LayerEffects | null {
  return copied === null ? null : structuredClone(copied);
}
