import { expect, it } from "vitest";
import { createPolygonEdit, polygonMask } from "./lasso";

const at = (m: Uint8Array, w: number, x: number, y: number): number => m[y * w + x];

it("fills a concave polygon with even-odd", () => {
  // A "U": the notch between x 4..6 from the top down to y 6 stays empty.
  const u = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const m = polygonMask(u, { x: 0, y: 0, width: 10, height: 10 });
  expect(at(m, 10, 2, 5)).toBe(255);
  expect(at(m, 10, 8, 5)).toBe(255);
  expect(at(m, 10, 5, 3)).toBe(0);
  expect(at(m, 10, 5, 8)).toBe(255);
});

it("fills both lobes of a figure eight and nothing above or below", () => {
  const eight = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];
  const m = polygonMask(eight, { x: 0, y: 0, width: 10, height: 10 });
  expect(at(m, 10, 9, 5)).toBe(255); // right lobe
  expect(at(m, 10, 0, 5)).toBe(255); // left lobe
  expect(at(m, 10, 5, 1)).toBe(0); // above the crossing is outside
  expect(at(m, 10, 5, 8)).toBe(0); // below it too
});

it("anti-aliases a diagonal edge", () => {
  const tri = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 0, y: 8 },
  ];
  const m = polygonMask(tri, { x: 0, y: 0, width: 8, height: 8 });
  expect(at(m, 8, 0, 0)).toBe(255);
  expect(at(m, 8, 7, 7)).toBe(0);
  expect(at(m, 8, 4, 3)).toBeGreaterThan(0);
  expect(at(m, 8, 4, 3)).toBeLessThan(255);
});

it("edits a polygon point by point", () => {
  const edit = createPolygonEdit();
  edit.add({ x: 0, y: 0 });
  edit.add({ x: 5, y: 0 });
  edit.add({ x: 5, y: 5 });
  expect(edit.points()).toHaveLength(3);
  edit.undo();
  expect(edit.points()).toHaveLength(2);
  expect(edit.close()).toBeNull();
  edit.add({ x: 0, y: 5 });
  edit.add({ x: 3, y: 3 });
  expect(edit.close()).toHaveLength(4);
  edit.add({ x: 1, y: 1 });
  edit.cancel();
  expect(edit.points()).toEqual([]);
});
