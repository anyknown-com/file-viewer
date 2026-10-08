import { describe, expect, it } from "vitest";
import type { LayerEffects } from "../../comp/index";
import { readTexture } from "../engine/gl/read";
import { createTarget } from "../engine/gl/target";
import { defaultEffect, EFFECT_NAMES, EFFECT_RANGES, type EffectName } from "./defaults";
import { runEffectPasses } from "./passes";

const canvas = document.createElement("canvas");
const maybe = canvas.getContext("webgl2");
if (!maybe) throw new Error("no webgl2");
const gl = maybe;

type RGB = [number, number, number];
/** A `size`² image (premultiplied RGBA8): `rgb` over the `rects` ([x, y, w, h]), transparent elsewhere. */
function image(size: number, rects: number[][], rgb: RGB = [255, 255, 255]): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (const [x0, y0, w, h] of rects)
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) px.set([...rgb, 255], (y * size + x) * 4);
  return px;
}

/** `effects` around `pixels` in a frame `pad` px wider on every side; `at(x, y)` = straight 0–1 rgba. */
function render(pixels: Uint8Array, size: number, pad: number, effects: LayerEffects, k = 1) {
  const src = createTarget(gl, size, size, "rgba8");
  gl.bindTexture(gl.TEXTURE_2D, src.texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const w = size + 2 * pad;
  const out = createTarget(gl, w, w, "rgba8");
  runEffectPasses(gl, src.texture, { width: size, height: size }, { ...out, pad }, effects, k);
  const px = readTexture(gl, out.texture, { x: 0, y: 0, width: w, height: w }, 4);
  src.dispose();
  out.dispose();
  const at = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const a = px[i + 3] / 255;
    const c = (n: number) => (a === 0 ? 0 : px[i + n] / 255 / a);
    return { r: c(0), g: c(1), b: c(2), a };
  };
  return { px, w, at };
}

const fx = <N extends EffectName>(name: N, patch: Partial<NonNullable<LayerEffects[N]>>) => ({
  ...defaultEffect(name),
  ...patch,
});

/** A 100² opaque white square in a 240² frame, pad 70, k = 1. */
const square = (effects: LayerEffects) => render(image(100, [[0, 0, 100, 100]]), 100, 70, effects);

const byte = (v: number) => Math.round(v * 255);

/** Alpha > 0 exactly on [x0, x1) × [y0, y1). */
function coversOnly(r: ReturnType<typeof render>, x0: number, y0: number, x1: number, y1: number) {
  for (let y = 0; y < r.w; y++)
    for (let x = 0; x < r.w; x++) {
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      if (r.at(x, y).a > 0 !== inside) return `(${x}, ${y})`;
    }
  return "ok";
}

describe("runEffectPasses on a 100² square", () => {
  it("strokes outside 10 px with square corners", () => {
    const r = square({ stroke: fx("stroke", { size: 10, red: 1 }) });
    expect(coversOnly(r, 60, 60, 180, 180)).toBe("ok");
    for (const [x, y] of [
      [60, 60],
      [179, 60],
      [60, 179],
      [179, 179],
    ])
      expect(r.at(x, y)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(r.at(120, 120)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("strokes inside without leaving the square", () => {
    const r = square({ stroke: fx("stroke", { size: 10, inside: true, red: 1 }) });
    expect(coversOnly(r, 70, 70, 170, 170)).toBe("ok");
    expect(r.at(79, 120)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(r.at(80, 120)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  // Compositor's angle is where the light comes from: 90 drops the shadow down, 0 casts it left.
  it("casts the shadow away from the light", () => {
    const down = square({ shadow: fx("shadow", { angle: 90, distance: 10, blur: 0, opacity: 1 }) });
    expect(coversOnly(down, 70, 70, 170, 180)).toBe("ok");
    expect(down.at(120, 175)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    const left = square({ shadow: fx("shadow", { angle: 0, distance: 10, blur: 0, opacity: 1 }) });
    expect(coversOnly(left, 60, 70, 170, 170)).toBe("ok");
    const right = square({ shadow: fx("shadow", { angle: 180, distance: 10, blur: 0 }) });
    expect(coversOnly(right, 70, 70, 180, 170)).toBe("ok");
  });

  it("adds nothing inside the shape with an outer glow", () => {
    const plain = square({});
    const r = square({ outerGlow: fx("outerGlow", { size: 20 }) });
    for (let y = 70; y < 170; y++)
      for (let x = 70; x < 170; x++) expect(r.at(x, y)).toEqual(plain.at(x, y));
    expect(r.at(65, 120).a).toBeGreaterThan(0);
  });

  it("keeps inner glow and inner shadow inside the shape", () => {
    const glow = square({ innerGlow: fx("innerGlow", { size: 20, red: 0 }) });
    expect(coversOnly(glow, 70, 70, 170, 170)).toBe("ok");
    expect(glow.at(71, 120).r).toBeLessThan(1);
    const shadow = square({ innerShadow: fx("innerShadow", { opacity: 1 }) });
    expect(coversOnly(shadow, 70, 70, 170, 170)).toBe("ok");
    expect(shadow.at(120, 71).r).toBeLessThan(0.5);
    expect(shadow.at(120, 120).r).toBe(1);
  });

  it("turns the whole inside the overlay color", () => {
    const r = square({ colorOverlay: fx("colorOverlay", { red: 0.2, green: 0.4, blue: 0.6 }) });
    expect(coversOnly(r, 70, 70, 170, 170)).toBe("ok");
    for (const [x, y] of [
      [70, 70],
      [120, 120],
      [169, 169],
    ]) {
      const i = (y * r.w + x) * 4;
      expect([...r.px.subarray(i, i + 4)]).toEqual([byte(0.2), byte(0.4), byte(0.6), 255]);
    }
  });

  it("ignores switched-off effects", () => {
    const off = Object.fromEntries(
      EFFECT_NAMES.map((name) => [name, { ...defaultEffect(name), enabled: false }]),
    );
    expect(square(off).px).toEqual(square({}).px);
  });
});

// OuterGlowTests.swift: a 40² image with a 20² white square at (10, 10); pad = Compositor's inset.
describe("outer glow (OuterGlowTests)", () => {
  const PAD = 30;
  const glowOn = (
    patch: Partial<NonNullable<LayerEffects["outerGlow"]>>,
    size = 40,
    inner = 20,
  ) => {
    const o = (size - inner) / 2;
    return render(image(size, [[o, o, inner, inner]]), size, PAD, {
      outerGlow: fx("outerGlow", patch),
    });
  };

  const far = (size: number) =>
    glowOn({ size, red: 1, green: 0, blue: 0, opacity: 1 }).at(PAD + 2, PAD + 20).a;
  const near = (opacity: number) => glowOn({ size: 10, opacity }).at(PAD + 5, PAD + 20).a;

  it("renders omnidirectionally", () => {
    const r = glowOn({ size: 10, red: 0, green: 1, blue: 0, opacity: 1 });
    const c = PAD + 20;
    expect(r.at(c, c).a).toBeGreaterThan(0.95);
    expect(r.at(c, c).r).toBeGreaterThan(0.95);
    const sides = [r.at(PAD + 5, c), r.at(PAD + 35, c), r.at(c, PAD + 5), r.at(c, PAD + 35)];
    for (const s of sides) {
      expect(s.a).toBeGreaterThan(0.1);
      expect(s.g).toBeGreaterThan(0.8);
    }
    for (const s of sides) expect(Math.abs(s.a - sides[0].a)).toBeLessThan(0.05);
  });

  it("reaches further when larger and is stronger when more opaque", () => {
    expect(far(20)).toBeGreaterThan(far(4));
    expect(near(1)).toBeGreaterThan(near(0.2));
  });

  it("follows a glyph's outline, into its notches", () => {
    const px = image(60, [
      [15, 15, 30, 8],
      [26, 23, 8, 22],
    ]);
    const r = render(px, 60, PAD, {
      outerGlow: fx("outerGlow", { size: 8, red: 0, green: 1, blue: 1, opacity: 1 }),
    });
    expect(r.at(PAD + 30, PAD + 30)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    for (const [x, y] of [
      [30, 12],
      [20, 27],
    ]) {
      const s = r.at(PAD + x, PAD + y);
      expect(s.a).toBeGreaterThan(0.05);
      expect(s.g).toBeGreaterThan(0.5);
      expect(s.b).toBeGreaterThan(0.5);
    }
  });

  it("combines with a stroke and a drop shadow", () => {
    const r = render(image(50, [[15, 15, 20, 20]]), 50, PAD, {
      stroke: fx("stroke", { size: 3 }),
      outerGlow: fx("outerGlow", { size: 10, red: 1, green: 0, blue: 0, opacity: 1 }),
      shadow: fx("shadow", {
        angle: 180,
        distance: 25,
        blur: 4,
        red: 0,
        green: 0,
        blue: 1,
        opacity: 1,
      }),
    });
    const c = PAD + 25;
    expect(r.at(c, c)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    const stroke = r.at(PAD + 13, c);
    expect(stroke.a).toBeGreaterThan(0.9);
    expect(Math.max(stroke.r, stroke.g, stroke.b)).toBeLessThan(0.2);
    const glow = r.at(PAD + 10, c);
    expect(glow.a).toBeGreaterThan(0.05);
    expect(glow.r).toBeGreaterThan(0.6);
    const shadow = r.at(c + 25, c);
    expect(shadow.a).toBeGreaterThan(0.1);
    expect(shadow.b).toBeGreaterThan(0.6);
  });
});

// InnerGlowTests.swift: a 40² solid black square; inner glow adds no margin (Compositor's 2 px).
describe("inner glow (InnerGlowTests)", () => {
  it("tints the edge inside and leaves the center and outside alone", () => {
    const r = render(image(40, [[0, 0, 40, 40]], [0, 0, 0]), 40, 2, {
      innerGlow: fx("innerGlow", { size: 12, red: 1, green: 1, blue: 0, opacity: 1 }),
    });
    expect(r.at(0, 0).a).toBe(0);
    const edge = r.at(2 + 2, 2 + 20);
    expect(edge.a).toBeGreaterThan(0.9);
    expect(edge.r).toBeGreaterThan(0.3);
    expect(edge.g).toBeGreaterThan(0.3);
    const center = r.at(2 + 20, 2 + 20);
    expect(center.r).toBeLessThan(0.2);
    expect(center.g).toBeLessThan(0.2);
  });
});

describe("defaultEffect and EFFECT_RANGES", () => {
  it("start as Compositor's structs do, switched on", () => {
    expect(defaultEffect("outerGlow")).toEqual({
      enabled: true,
      size: 20,
      red: 1,
      green: 1,
      blue: 1,
      opacity: 0.75,
    });
    expect(defaultEffect("innerGlow")).toEqual({
      enabled: true,
      size: 10,
      red: 1,
      green: 1,
      blue: 1,
      opacity: 0.75,
    });
    expect(defaultEffect("shadow")).toMatchObject({
      angle: 90,
      distance: 20,
      blur: 20,
      opacity: 0.5,
    });
    expect(defaultEffect("stroke")).toMatchObject({ size: 4, opacity: 1, inside: false });
  });

  it("hold every default inside its range", () => {
    for (const name of EFFECT_NAMES) {
      const e: Record<string, unknown> = defaultEffect(name);
      for (const [field, { min, max }] of Object.entries(EFFECT_RANGES[name])) {
        expect(e[field]).toBeGreaterThanOrEqual(min);
        expect(e[field]).toBeLessThanOrEqual(max);
      }
    }
    expect(EFFECT_RANGES.stroke.size).toEqual({ min: 0, max: 500 });
    expect(EFFECT_RANGES.shadow.distance).toEqual({ min: 0, max: 5000 });
    expect(EFFECT_RANGES.innerShadow.angle).toEqual({ min: -360, max: 360 });
  });
});
