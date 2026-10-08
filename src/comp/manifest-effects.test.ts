// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toJsonValue } from "./extra";
import { layerEffectsSchema } from "./manifest-effects";

const stroke = { enabled: true, size: 4, red: 0, green: 0, blue: 0, opacity: 1, inside: false };
const shadow = { angle: 90, distance: 20, blur: 20, red: 0, green: 0, blue: 0, opacity: 0.5 };
const glow = { size: 20, red: 1, green: 1, blue: 1, opacity: 0.75 };

describe("layerEffectsSchema", () => {
  it("round-trips every effect unchanged when in range", () => {
    const input = {
      stroke,
      shadow,
      innerShadow: shadow,
      colorOverlay: { red: 1, green: 0, blue: 0, opacity: 1 },
      outerGlow: glow,
      innerGlow: glow,
    };
    expect(toJsonValue(layerEffectsSchema.parse(input))).toEqual(input);
  });

  it("clamps out-of-range values instead of rejecting them", () => {
    const parsed = layerEffectsSchema.parse({
      stroke: { ...stroke, size: 9999, opacity: 2, red: -1 },
      shadow: { ...shadow, angle: -720, distance: 6000, blur: -5 },
      innerShadow: { ...shadow, angle: 720 },
      outerGlow: { ...glow, size: 501, green: 3 },
      innerGlow: { ...glow, size: -1 },
      colorOverlay: { red: 0, green: 0, blue: 0, opacity: -0.5 },
    });
    expect(parsed.stroke?.size).toBe(500);
    expect(parsed.stroke?.opacity).toBe(1);
    expect(parsed.stroke?.red).toBe(0);
    expect(parsed.shadow?.angle).toBe(-360);
    expect(parsed.shadow?.distance).toBe(5000);
    expect(parsed.shadow?.blur).toBe(0);
    expect(parsed.innerShadow?.angle).toBe(360);
    expect(parsed.outerGlow?.size).toBe(500);
    expect(parsed.outerGlow?.green).toBe(1);
    expect(parsed.innerGlow?.size).toBe(0);
    expect(parsed.colorOverlay?.opacity).toBe(0);
  });

  it("treats enabled as optional", () => {
    const { enabled: _enabled, ...noEnabled } = stroke;
    const parsed = layerEffectsSchema.parse({
      stroke: noEnabled,
      shadow: { ...shadow, enabled: null },
    });
    expect(parsed.stroke?.enabled).toBeUndefined();
    expect(toJsonValue(parsed)).toEqual({ stroke: noEnabled, shadow });
  });

  it("requires fields that have a Swift default value", () => {
    const { inside: _inside, ...noInside } = stroke;
    const result = layerEffectsSchema.safeParse({ stroke: noInside });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toContain("stroke.inside");
  });

  it("keeps unknown keys in extra, through the clamp", () => {
    const parsed = layerEffectsSchema.parse({
      stroke: { ...stroke, size: 9999, spread: 3 },
      bevel: { depth: 1 },
    });
    expect(parsed.stroke?.extra).toEqual({ spread: 3 });
    expect(parsed.extra).toEqual({ bevel: { depth: 1 } });
    expect(toJsonValue(parsed)).toEqual({
      stroke: { ...stroke, size: 500, spread: 3 },
      bevel: { depth: 1 },
    });
  });
});
