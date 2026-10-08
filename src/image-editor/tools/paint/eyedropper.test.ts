import { expect, it } from "vitest";
import { averageAt } from "./eyedropper";

// 3 × 3 image, red channel 0…8, the rest fixed.
const data = new Uint8Array(9 * 4);
for (let i = 0; i < 9; i++) data.set([i * 10, 50, 100, 255], i * 4);

it("averages a 3 × 3 square", () => {
  expect(averageAt(data, 3, 3, 1, 1, 3)).toEqual([40, 50, 100, 255]);
});

it("reads one pixel at size 1", () => {
  expect(averageAt(data, 3, 3, 2, 1, 1)).toEqual([50, 50, 100, 255]);
});

it("averages only the pixels inside the image at a corner", () => {
  // (0, 0), (1, 0), (0, 1), (1, 1): red 0, 10, 30, 40.
  expect(averageAt(data, 3, 3, 0, 0, 3)).toEqual([20, 50, 100, 255]);
  expect(averageAt(data, 3, 3, 0, 0, 5)).toEqual([40, 50, 100, 255]);
});
