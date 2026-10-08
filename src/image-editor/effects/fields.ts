import type { AdjustKey } from "../adjust/messages";
import type { EffectName } from "./defaults";

export type EffectField = {
  key: string;
  label: AdjustKey;
  type: "slider" | "color" | "position";
  step?: number;
};

const size: EffectField = {
  key: "size",
  label: "image.effects.field.size",
  type: "slider",
  step: 1,
};
const color: EffectField = { key: "color", label: "image.effects.field.color", type: "color" };
const opacity: EffectField = {
  key: "opacity",
  label: "image.effects.field.opacity",
  type: "slider",
  step: 0.01,
};
const shadow: EffectField[] = [
  { key: "angle", label: "image.effects.field.angle", type: "slider", step: 1 },
  { key: "distance", label: "image.effects.field.distance", type: "slider", step: 1 },
  { key: "blur", label: "image.effects.field.blur", type: "slider", step: 1 },
  color,
  opacity,
];

export const EFFECT_FIELDS: Record<EffectName, readonly EffectField[]> = {
  stroke: [
    size,
    color,
    opacity,
    { key: "inside", label: "image.effects.field.position", type: "position" },
  ],
  shadow,
  colorOverlay: [color, opacity],
  innerShadow: shadow,
  outerGlow: [size, color, opacity],
  innerGlow: [size, color, opacity],
};
