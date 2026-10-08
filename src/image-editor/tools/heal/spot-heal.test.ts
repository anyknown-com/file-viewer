import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { spotHeal, type SpotHealInput } from "./spot-heal";

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(`src/image-editor/tools/heal/__fixtures__/${name}`));

function maxDiff(a: Uint8Array, b: Uint8Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
  return max;
}

const MODES = ["contentAware", "texture"] as const;

// Compositor's SpotHealingTests: vertical gray stripes, 2 px wide, with a 10 × 10 red blemish in
// the middle, healed under a hard 24 px brush at (60, 40).
function blemished(mode: SpotHealInput["mode"]): SpotHealInput {
  const width = 120;
  const height = 80;
  const data = new Uint8Array(width * height * 4);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const red = x >= 55 && x < 65 && y >= 35 && y < 45;
      const gray = x % 4 < 2 ? 100 : 112;
      data.set(red ? [230, 20, 20, 255] : [gray, gray, gray, 255], (y * width + x) * 4);
      if ((x + 0.5 - 60) ** 2 + (y + 0.5 - 40) ** 2 <= 144) mask[y * width + x] = 255;
    }
  }
  return { width, height, data, mask, mode };
}

describe("spotHeal", () => {
  it.each(MODES)("heals the blemish under the brush and nothing else (%s)", (mode) => {
    const input = blemished(mode);
    const before = input.data.slice();
    const after = spotHeal(input);
    const px = (x: number, y: number) => [
      ...after.subarray((y * 120 + x) * 4, (y * 120 + x) * 4 + 4),
    ];
    for (const [x, y] of [
      [60, 40],
      [56, 36],
      [64, 44],
    ] as const) {
      const [r, g, , a] = px(x, y);
      expect(r! - g!, `(${x}, ${y})`).toBeLessThan(30);
      expect(g, `(${x}, ${y})`).toBeGreaterThanOrEqual(80);
      expect(g, `(${x}, ${y})`).toBeLessThanOrEqual(130);
      expect(a).toBe(255);
    }
    // Away from the brush, nothing moves.
    for (const [x, y] of [
      [10, 10],
      [90, 40],
      [30, 40],
      [60, 10],
      [60, 70],
    ] as const) {
      expect(px(x, y)).toEqual([...before.subarray((y * 120 + x) * 4, (y * 120 + x) * 4 + 4)]);
    }
  });

  it.each([
    ["heal", "spot-heal-content-aware", "contentAware"],
    ["heal", "spot-heal-texture", "texture"],
    ["heal-large", "heal-large-texture", "texture"],
  ] as const)("matches HealPixels.c within 1 (%s, %s)", (name, expected, mode) => {
    const data = fixture(`${name}-input.rgba`);
    const mask = fixture(`${name}-mask.r8`);
    const width = Math.sqrt(mask.length);
    const out = spotHeal({ width, height: width, data, mask, mode });
    expect(maxDiff(out, fixture(`${expected}.rgba`))).toBeLessThanOrEqual(1);
    for (let p = 0; p < mask.length; p++) {
      if (mask[p]) continue;
      for (let c = 0; c < 4; c++) if (out[p * 4 + c] !== data[p * 4 + c]) throw new Error(`${p}`);
    }
  });

  it("keeps the bytes outside the mask", () => {
    const input = blemished("contentAware");
    input.data[3] = 128; // a translucent pixel survives the premultiplied round trip untouched
    input.data[0] = 77;
    const out = spotHeal(input);
    for (let p = 0; p < input.mask.length; p++) {
      if (input.mask[p]) continue;
      expect(out.subarray(p * 4, p * 4 + 4)).toEqual(input.data.subarray(p * 4, p * 4 + 4));
    }
  });

  it("throws AbortError when the signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => spotHeal(blemished("texture"), controller.signal)).toThrow(
      expect.objectContaining({ name: "AbortError" }),
    );
  });
});
