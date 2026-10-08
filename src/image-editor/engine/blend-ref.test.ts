import { describe, expect, it } from "vitest";
import { BLEND_MODES, type BlendMode } from "../api";
import { blendRef, compositeRef } from "./blend-ref";

const gray = (v: number): [number, number, number] => [v, v, v];

// Hand-computed B(b, s) for (b, s) = (0.2, 0.7) and (0.7, 0.4).
const separable: [BlendMode, number, number][] = [
  ["Normal", 0.7, 0.4],
  ["Darken", 0.2, 0.4],
  ["Multiply", 0.14, 0.28],
  ["Color Burn", 0, 0.25],
  ["Linear Burn", 0, 0.1],
  ["Lighten", 0.7, 0.7],
  ["Screen", 0.76, 0.82],
  ["Color Dodge", 2 / 3, 1],
  ["Linear Dodge (Add)", 0.9, 1],
  ["Overlay", 0.28, 0.64],
  ["Soft Light", 0.12 + Math.sqrt(0.2) * 0.4, 0.658],
  ["Hard Light", 0.52, 0.56],
  ["Vivid Light", 1 / 3, 0.625],
  ["Linear Light", 0.6, 0.5],
  ["Pin Light", 0.4, 0.7],
  ["Hard Mix", 0, 1],
  ["Difference", 0.5, 0.3],
  ["Exclusion", 0.62, 0.54],
  ["Subtract", 0, 0.3],
  ["Divide", 0.2 / 0.7, 1],
];

// Hand-computed for cb = (0.8, 0.4, 0.2), cs = (0.1, 0.5, 0.9) and for cb = gray 0.9, cs = red.
const nonSeparable: [BlendMode, number[], number[]][] = [
  ["Hue", [0.255, 0.555, 0.855], [0.9, 0.9, 0.9]],
  [
    "Saturation",
    [0.498 + 0.8 - 0.397333, 0.498 + 0.266667 - 0.397333, 0.498 - 0.397333],
    [0.9, 0.9, 0.9],
  ],
  ["Color", [0.174, 0.574, 0.974], [1, 0.9 - 0.3 / 7, 0.9 - 0.3 / 7]],
  ["Luminosity", [0.726, 0.326, 0.126], [0.3, 0.3, 0.3]],
];

const close = (expected: number[]): unknown[] => expected.map((v) => expect.closeTo(v, 5));

describe("blendRef", () => {
  it("covers all 24 modes", () => {
    expect(separable.length + nonSeparable.length).toBe(BLEND_MODES.length);
  });

  it.each(separable)("%s matches two hand-computed values", (mode, first, second) => {
    expect(blendRef(mode, gray(0.2), gray(0.7))).toEqual(close(gray(first)));
    expect(blendRef(mode, gray(0.7), gray(0.4))).toEqual(close(gray(second)));
  });

  it.each(nonSeparable)("%s matches two hand-computed values", (mode, first, second) => {
    expect(blendRef(mode, [0.8, 0.4, 0.2], [0.1, 0.5, 0.9])).toEqual(close(first));
    expect(blendRef(mode, gray(0.9), [1, 0, 0])).toEqual(close(second));
  });

  it("uses Photoshop's Soft Light at b = 0.25 and 0.75", () => {
    const a = 0.6;
    expect(blendRef("Soft Light", gray(a), gray(0.25))).toEqual(
      close(gray(2 * a * 0.25 + a * a * 0.5)),
    );
    expect(blendRef("Soft Light", gray(a), gray(0.75))).toEqual(
      close(gray(2 * a * 0.25 + Math.sqrt(a) * 0.5)),
    );
  });

  it("keeps SetLum results inside 0–1", () => {
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 500; i++) {
      const cb: [number, number, number] = [rand(), rand(), rand()];
      const cs: [number, number, number] = [rand(), rand(), rand()];
      for (const mode of ["Hue", "Saturation", "Color", "Luminosity"] as const) {
        for (const v of blendRef(mode, cb, cs)) {
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });
});

describe("compositeRef", () => {
  it("is plain source-over for Normal", () => {
    expect(compositeRef([1, 0, 0, 1], [0, 0, 1, 0.5], "Normal")).toEqual(close([0.5, 0, 0.5, 1]));
  });

  it("shows the source alone over a transparent backdrop", () => {
    expect(compositeRef([0, 0, 0, 0], [0.2, 0.4, 0.6, 0.5], "Multiply")).toEqual(
      close([0.2, 0.4, 0.6, 0.5]),
    );
  });
});
