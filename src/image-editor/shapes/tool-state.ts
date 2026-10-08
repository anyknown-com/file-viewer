import type { LayerShapeStyle } from "../../comp/index";
import { defaultShapeStyle } from "./render";

let current: LayerShapeStyle = defaultShapeStyle("Rectangle");
const listeners = new Set<() => void>();

/** The style the shape tool gives new shapes. */
export const shapeToolState = {
  get: (): LayerShapeStyle => current,
  set(next: LayerShapeStyle): void {
    current = next;
    for (const fn of listeners) fn();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
