import { expect, it } from "vitest";
import { gradientAt, lerpStop, lock45 } from "./gradient";

const a = { x: 0, y: 0 };
const b = { x: 100, y: 0 };

it("runs 0 at a to 1 at b along a linear gradient and clamps beyond", () => {
  expect(gradientAt("linear", a, b, a)).toBe(0);
  expect(gradientAt("linear", a, b, b)).toBe(1);
  expect(gradientAt("linear", a, b, { x: 50, y: 40 })).toBe(0.5);
  expect(gradientAt("linear", a, b, { x: -20, y: 0 })).toBe(0);
  expect(gradientAt("linear", a, b, { x: 150, y: 0 })).toBe(1);
});

it("runs from 0 at the center of a radial gradient", () => {
  expect(gradientAt("radial", a, b, a)).toBe(0);
  expect(gradientAt("radial", a, b, { x: 0, y: 50 })).toBe(0.5);
  expect(gradientAt("radial", a, b, { x: 0, y: 300 })).toBe(1);
});

it("locks to 45° steps", () => {
  expect(lock45(a, { x: 10, y: 3 })).toEqual({ x: 10, y: 0 });
  expect(lock45(a, { x: 10, y: 9 })).toEqual({ x: 10, y: 10 });
  expect(lock45(a, { x: 2, y: -10 })).toEqual({ x: 0, y: -10 });
});

it("mixes the stops halfway", () => {
  expect(lerpStop(0.5, [0, 0, 0, 255], [255, 255, 255, 255])).toEqual([128, 128, 128, 255]);
  expect(lerpStop(0.5, [200, 100, 0, 255], [200, 100, 0, 0])).toEqual([200, 100, 0, 128]);
});
