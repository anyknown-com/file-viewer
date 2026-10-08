import { describe, expect, it } from "vitest";
import { ADJUSTMENT_KINDS, KIND_KEY, defaultAdjustment, randomSeed } from "./settings";

describe("adjustment settings", () => {
  it("lists all 12 kinds, the same ones KIND_KEY maps", () => {
    expect(ADJUSTMENT_KINDS).toHaveLength(12);
    expect(ADJUSTMENT_KINDS.toSorted()).toEqual(Object.keys(KIND_KEY).toSorted());
    expect(new Set(Object.values(KIND_KEY)).size).toBe(12);
  });

  it("builds each kind's default with the given seed", () => {
    for (const kind of ADJUSTMENT_KINDS) {
      const s = defaultAdjustment(kind, 7);
      expect(s.kind).toBe(kind);
      expect(s.levels.ranges).toHaveLength(4);
      expect(s.curves.channels).toHaveLength(4);
      expect([s.hue, s.saturation, s.lightness, s.colorize]).toEqual([0, 0, 0, false]);
    }
    expect(defaultAdjustment("Grain", 7).grainSettings?.seed).toBe(7);
    expect(defaultAdjustment("Add Noise", 7).noiseSeed).toBe(7);
    // Compositor leaves the other kinds' optional settings out, so they save as before.
    expect(defaultAdjustment("Levels", 7).exposureSettings).toBeUndefined();
    expect(defaultAdjustment("Levels", 7).noiseSeed).toBeUndefined();
  });

  it("draws a uint32 seed", () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
  });
});
