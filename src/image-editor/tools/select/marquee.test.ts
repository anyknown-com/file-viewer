import { expect, it } from "vitest";
import { ellipseMask, marqueeRect } from "./marquee";

const none = { shift: false, alt: false };

it("drags a plain rectangle in any direction", () => {
  expect(marqueeRect({ x: 50, y: 40 }, { x: 10, y: 20 }, none)).toEqual({
    x: 10,
    y: 20,
    width: 40,
    height: 20,
  });
});

it("locks a square to the longer side", () => {
  const r = marqueeRect({ x: 10, y: 10 }, { x: 30, y: 70 }, { shift: true, alt: false });
  expect(r).toEqual({ x: 10, y: 10, width: 60, height: 60 });
  const up = marqueeRect({ x: 100, y: 100 }, { x: 80, y: 20 }, { shift: true, alt: false });
  expect(up).toEqual({ x: 20, y: 20, width: 80, height: 80 });
});

it("grows around the start point with Alt", () => {
  const r = marqueeRect({ x: 50, y: 50 }, { x: 60, y: 70 }, { shift: false, alt: true });
  expect(r).toEqual({ x: 40, y: 30, width: 20, height: 40 });
  expect(r.x + r.width / 2).toBe(50);
  expect(r.y + r.height / 2).toBe(50);
});

it("combines Shift and Alt into a centered square", () => {
  const r = marqueeRect({ x: 50, y: 50 }, { x: 60, y: 70 }, { shift: true, alt: true });
  expect(r).toEqual({ x: 30, y: 30, width: 40, height: 40 });
});

it("fills the middle of an ellipse and leaves the corners empty", () => {
  const m = ellipseMask({ x: 0, y: 0, width: 20, height: 10 });
  expect(m[5 * 20 + 10]).toBe(255);
  expect(m[0]).toBe(0);
  expect(m[9 * 20 + 19]).toBe(0);
  expect(m[5 * 20 + 0]).toBeGreaterThan(0);
  expect(m[5 * 20 + 0]).toBeLessThan(255);
});
